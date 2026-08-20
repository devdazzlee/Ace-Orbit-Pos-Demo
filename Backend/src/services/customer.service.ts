import { Customer, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import bcrypt from 'bcryptjs';
import { ledgerBalanceEngine } from './ledger-balance.engine';
import CustomerLedgerService from './customer-ledger.service';

class CustomerService {
    private ledgerService = new CustomerLedgerService();

    private async withComputedBalances<T extends { id: string; outstanding_balance: Prisma.Decimal }>(
        customers: T[],
    ): Promise<T[]> {
        if (customers.length === 0) return customers;
        const balances = await this.ledgerService.computeDisplayBalances(customers.map((c) => c.id));
        return customers.map((customer) => ({
            ...customer,
            outstanding_balance: new Prisma.Decimal(
                balances.get(customer.id) ?? Number(customer.outstanding_balance),
            ),
        }));
    }
    private generateToken(cusId: Customer['id'], email: Customer['email']): string {
        return jwt.sign(
            { email, id: cusId },
            config.jwtSecret,
            // No expiresIn — token valid until explicit logout
        );
    }

    private async verifyCustomerExistance(email: Customer['email']): Promise<boolean> {
        if (!email) return false;
        const customer = await prisma.customer.findFirst({ where: { email } });
        return !!customer;
    }

    public async createCustomer(data: Customer) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password!, 10);
        const customer = await prisma.customer.create({
            data: { ...data, password: hashedPassword },
        });

        const token = this.generateToken(customer.id, customer.email!);

        // Persist session in DB — one active session per customer
        await prisma.customerSession.deleteMany({ where: { customer_id: customer.id } });
        await prisma.customerSession.create({ data: { customer_id: customer.id, token } });

        return { email: customer.email, token };
    }

    public async createShopCustomer(
        data: Customer,
        createdBy?: string,
    ) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const openingBalance = new Prisma.Decimal(data.outstanding_balance ?? 0);
        if (openingBalance.lt(0)) {
            throw new AppError(400, 'Outstanding balance cannot be negative');
        }

        const customer = await prisma.$transaction(async (tx) => {
            const created = await tx.customer.create({
                data: {
                    ...data,
                    outstanding_balance: new Prisma.Decimal(0),
                },
            });

            if (openingBalance.gt(0)) {
                await ledgerBalanceEngine.postSignedAdjustment(tx, {
                    customerId: created.id,
                    signedDelta: Number(openingBalance),
                    description: 'Opening balance (existing credit before POS)',
                    referenceNo: 'DEBIT',
                    createdBy: createdBy ?? undefined,
                });
            }

            return tx.customer.findUniqueOrThrow({ where: { id: created.id } });
        });

        return { customer };
    }

    public async loginCustomer(email: Customer['email'], password: Customer['password']) {
        if (!email) throw new AppError(400, 'Email is required for login');
        const customer = await prisma.customer.findFirst({ where: { email } });

        if (!customer || !customer.password) {
            throw new AppError(401, 'Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password!, customer.password);
        if (!isPasswordValid) {
            throw new AppError(401, 'Invalid credentials');
        }

        const token = this.generateToken(customer.id, customer.email!);

        // Persist session in DB — replace any existing session
        await prisma.customerSession.deleteMany({ where: { customer_id: customer.id } });
        await prisma.customerSession.create({ data: { customer_id: customer.id, token } });

        return { email: customer.email, token };
    }

    public async getCustomerById(customerId: Customer['id']) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new AppError(404, 'Customer not found');
        const [withBalance] = await this.withComputedBalances([customer]);
        return withBalance;
    }

    public async getCustomers(search?: string) {
        const customers = await prisma.customer.findMany({
            where: search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone_number: { contains: search } },
                    ],
                }
                : undefined,
            orderBy: { created_at: 'desc' },
        });
        return this.withComputedBalances(customers);
    }

    public async updateCustomer(customerId: Customer['id'], updateData: Partial<Customer>) {
        const existingCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!existingCustomer) throw new AppError(404, 'Customer not found');

        const { outstanding_balance, ...profileUpdate } = updateData;

        if (profileUpdate.password) {
            profileUpdate.password = await bcrypt.hash(profileUpdate.password, 10);
        }

        if (outstanding_balance !== undefined && outstanding_balance !== null) {
            const requested = Number(outstanding_balance);
            if (Number.isNaN(requested) || requested < 0) {
                throw new AppError(400, 'Outstanding balance cannot be negative');
            }

            const currentRunning = await ledgerBalanceEngine.getRunningBalance(prisma, customerId);
            const delta = Number((requested - currentRunning).toFixed(3));

            if (Math.abs(delta) > 0.009) {
                return prisma.$transaction(async (tx) => {
                    await ledgerBalanceEngine.postSignedAdjustment(tx, {
                        customerId,
                        signedDelta: delta,
                        description: 'Balance correction from customer profile',
                        referenceNo: delta >= 0 ? 'DEBIT' : 'CREDIT',
                    });

                    if (Object.keys(profileUpdate).length === 0) {
                        return tx.customer.findUniqueOrThrow({ where: { id: customerId } });
                    }

                    return tx.customer.update({ where: { id: customerId }, data: profileUpdate });
                });
            }
        }

        if (Object.keys(profileUpdate).length === 0) {
            return existingCustomer;
        }

        return prisma.customer.update({ where: { id: customerId }, data: profileUpdate });
    }

    public async deleteCustomer(customerId: Customer['id']) {
        const existingCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!existingCustomer) throw new AppError(404, 'Customer not found');

        await prisma.$transaction(
            async (tx) => {
                // Credit ledger + its revision audit trail block customer delete
                // (required FK, no ON DELETE CASCADE in DB)
                await tx.customerSaleLedgerRevision.deleteMany({ where: { customer_id: customerId } });
                await tx.customerLedger.deleteMany({ where: { customer_id: customerId } });

                await tx.customerSession.deleteMany({ where: { customer_id: customerId } });
                await tx.deviceIdentity.deleteMany({ where: { customer_id: customerId } });

                // Keep sale/order history; detach customer so FK constraints pass
                await tx.sale.updateMany({
                    where: { customer_id: customerId },
                    data: { customer_id: null },
                });
                await tx.order.updateMany({
                    where: { customer_id: customerId },
                    data: { customer_id: null },
                });
                await tx.holdSale.updateMany({
                    where: { customer_id: customerId },
                    data: { customer_id: null },
                });

                await tx.customer.delete({ where: { id: customerId } });
            },
            { maxWait: 15_000, timeout: 60_000 },
        );

        return { message: 'Customer deleted successfully' };
    }

    public async logoutCustomer(customerId: Customer['id']) {
        await prisma.customerSession.deleteMany({ where: { customer_id: customerId } });
        return { message: 'Logged out successfully' };
    }
}

export default CustomerService;

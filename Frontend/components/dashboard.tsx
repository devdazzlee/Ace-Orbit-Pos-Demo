"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { DashboardHome } from "@/components/dashboard-home";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { getDefaultDashboardTab } from "@/lib/role-utils";
import { cn } from "@/lib/utils";

import { Customers } from "@/components/customers";
import { Reports } from "@/components/reports";
import { Settings } from "@/components/settings";
import { Profile } from "@/components/profile";
import { SalesHistory } from "@/components/sales-history";
import { EmployeeManagement } from "@/components/employee-management";
import { Categories } from "@/components/categories";
import { Promotions } from "@/components/promotions";
import { Expenses } from "@/components/expenses";
import { TaxManagement } from "@/components/tax-management";
import { PurchaseOrders } from "@/components/purchase-orders";
import { Returns, Exchanges } from "@/components/returns";
import { GiftCards } from "@/components/gift-cards";
import { Loyalty } from "@/components/loyalty";
import { Shifts } from "@/components/shifts";
import { Audit } from "@/components/audit";
import { Backup } from "@/components/backup";
import { Integrations } from "@/components/integrations";
import { MultiLocation } from "@/components/multi-location";
import { Reservations } from "@/components/reservations";
import { LayawayHolds } from "@/components/layaway-holds";
import { Pricing } from "@/components/pricing";
import Inventory from "./inventory";
import { Stocks } from "./Stocks";
import { StockManagement } from "./StockManagement";
import {
  InventoryDashboard,
  Purchases,
  StockOut,
  StockMovementLog,
  StockAdjustment,
  StockView,
  InventoryReports,
  InventoryAudit,
} from "./inventory/index";
import { Sales } from "./sales";
import Orders from "./orders";
import WebsiteOrders from "./website-orders";
import Subcategories from "./sub-categories";
import Units from "./Units";
import Suppliers from "./suppliers";
import Brands from "./Brands";
import Colors from "./color";
import Sizes from "./sizes";
import { Salaries } from "./Salaries";
import { Designation } from "./Designation";
import BarcodeGenerator from "./barcode-generator";
import { NewSale } from "./new-sale";
import { PrinterSettings } from "./printer-settings";
import { ProductExport } from "./product-export";
import { CustomerLedger } from "./customer-ledger";
import { SupplierProfile } from "./supplier-profile";
import { Documentation } from "./documentation";
import { DashboardFinancialDetails } from "./dashboard-financial-details";


interface DashboardProps {
  onLogout: () => void;
}

const FULL_HEIGHT_VIEWS = new Set(["supplier-profile", "supplier-ledger", "customer-ledger"]);

export function Dashboard({ onLogout }: DashboardProps) {
  const DASHBOARD_TAB_STORAGE_KEY = "dashboard_active_tab";
  const LEDGER_CUSTOMER_KEY = "dashboard_ledger_customer_id";
  const LEDGER_SUPPLIER_KEY = "dashboard_supplier_profile_id";

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "dashboard";
    const savedTab = localStorage.getItem(DASHBOARD_TAB_STORAGE_KEY);
    if (savedTab && savedTab.trim()) return savedTab;
    const preferredTab = getDefaultDashboardTab(localStorage.getItem("role"));
    return preferredTab || "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardVisit, setDashboardVisit] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(LEDGER_CUSTOMER_KEY);
  });

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(LEDGER_SUPPLIER_KEY);
  });

  const openCustomerLedger = (customerId: string) => {
    setSelectedCustomerId(customerId);
    sessionStorage.setItem(LEDGER_CUSTOMER_KEY, customerId);
    setActiveTab("customer-ledger");
  };

  const closeCustomerLedger = () => {
    setSelectedCustomerId(null);
    sessionStorage.removeItem(LEDGER_CUSTOMER_KEY);
    setActiveTab("customers");
  };

  const openSupplierProfile = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    sessionStorage.setItem(LEDGER_SUPPLIER_KEY, supplierId);
    setActiveTab("supplier-profile");
  };

  const closeSupplierProfile = () => {
    setSelectedSupplierId(null);
    sessionStorage.removeItem(LEDGER_SUPPLIER_KEY);
    setActiveTab("suppliers");
  };

  useEffect(() => {
    localStorage.setItem(DASHBOARD_TAB_STORAGE_KEY, activeTab);
    if (activeTab !== "customer-ledger") {
      sessionStorage.removeItem(LEDGER_CUSTOMER_KEY);
    }
    if (activeTab !== "supplier-profile") {
      sessionStorage.removeItem(LEDGER_SUPPLIER_KEY);
    }
    if (activeTab === "dashboard") {
      setDashboardVisit((v) => v + 1);
    }
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardHome key={`dashboard-${dashboardVisit}`} onNavigate={setActiveTab} />;
      case "today-revenue":
        return (
          <DashboardFinancialDetails
            mode="revenue"
            onBack={() => setActiveTab("dashboard")}
            onNavigate={setActiveTab}
          />
        );
      case "today-cash-sales":
        return (
          <DashboardFinancialDetails
            mode="cash"
            onBack={() => setActiveTab("dashboard")}
            onNavigate={setActiveTab}
          />
        );
      case "today-credit-sales":
        return (
          <DashboardFinancialDetails
            mode="credit"
            onBack={() => setActiveTab("dashboard")}
            onNavigate={setActiveTab}
          />
        );
      case "today-expenses":
        return (
          <DashboardFinancialDetails
            mode="expenses"
            onBack={() => setActiveTab("dashboard")}
            onNavigate={setActiveTab}
          />
        );
      case "barcode-generator":
        return <BarcodeGenerator />;
      case "new-sale":
        return <NewSale />;
      case "orders":
        return <Orders />;
      case "website-orders":
        return <WebsiteOrders />;
      case "units":
        return <Units />;
      case "sales-history":
        return <SalesHistory />;
      case "brand":
        return <Brands />;
      case "colors":
        return <Colors />;
      case "sizes":
        return <Sizes />;
      case "returns":
        return <Returns module="returns" />;
      case "exchanges":
        return <Exchanges />;
      case "reservations":
        return <Reservations />;
      case "layaway-holds":
        return <LayawayHolds />;
      case "inventory":
        return <Inventory />;
      case "categories":
        return <Categories />;
      case "sub-categories":
        return <Subcategories />;
      case "suppliers":
        return <Suppliers onViewSupplier={openSupplierProfile} />;
      case "supplier-profile":
      case "supplier-ledger":
        return selectedSupplierId ? (
          <SupplierProfile
            supplierId={selectedSupplierId}
            onBack={closeSupplierProfile}
          />
        ) : (
          <Suppliers onViewSupplier={openSupplierProfile} />
        );
      case "purchase-orders":
        return <PurchaseOrders />;
      case "pricing":
        return <Pricing />;
      case "customers":
        return <Customers onViewLedger={openCustomerLedger} />;
      case "customer-ledger":
        return selectedCustomerId ? (
          <CustomerLedger
            customerId={selectedCustomerId}
            onBack={closeCustomerLedger}
          />
        ) : (
          <Customers onViewLedger={openCustomerLedger} />
        );
      case "loyalty":
        return <Stocks />;
      case "stock-management":
        return <StockManagement />;
      case "inventory-dashboard":
        return <InventoryDashboard onNavigate={setActiveTab} />;
      case "purchases":
        return <Purchases />;
      case "stock-out":
        return <StockOut />;
      case "stock-movement-log":
        return <StockMovementLog />;
      case "stock-adjustment":
        return <StockAdjustment />;
      case "stock-view":
        return <StockView />;
      case "inventory-reports":
        return <InventoryReports />;
      case "inventory-audit":
        return <InventoryAudit />;
      case "designation":
        return <Designation />;
      case "employees":
        return <EmployeeManagement />;
      case "shifts":
        return <Shifts />;
      case "salaries":
        return <Salaries />;
      case "promotions":
        return <Promotions />;
      case "expenses":
        return <Expenses />;
      case "tax-management":
        return <TaxManagement />;
      case "reports":
        return <Reports />;
      case "audit":
        return <Audit />;
      case "multi-location":
        return <MultiLocation />;
      case "integrations":
        return <Integrations />;
      case "backup":
        return <Backup />;
      case "profile":
        return <Profile />;
      case "settings":
        return <Settings />;
      case "printer-settings":
        return <PrinterSettings />;
      case "product-export":
        return <ProductExport />;
      case "documentation":
        return <Documentation />;
      default:
        return <DashboardHome />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-30">
        <Button
          variant="default"
          size="sm"
          onClick={() => setSidebarOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 shadow-lg"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col bg-gray-50 pt-16 lg:pt-0",
          FULL_HEIGHT_VIEWS.has(activeTab) ? "overflow-hidden" : "overflow-auto",
        )}
      >
        {renderContent()}
      </main>
    </div>
  );
}

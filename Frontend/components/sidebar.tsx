"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  getDefaultDashboardTab,
  normalizeUserRole,
  type UserRole,
} from "@/lib/role-utils";
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  LogOut,
  History,
  UserCheck,
  Truck,
  Grid3X3,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ArrowLeftRight,
  CreditCard,
  DollarSign,
  Receipt,
  Clock,
  Shield,
  StoreIcon,
  X,
  Warehouse,
  Printer as PrinterIcon,
  Download,
  User,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];
const SALES_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER"];
const INVENTORY_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
];
const PURCHASE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "PURCHASE_MANAGER",
];
const TRANSFER_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
];
const STOCK_OUT_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
];
const BRANCH_DATA_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
];
const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
];

interface SidebarMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  roles?: UserRole[];
}

interface SidebarMenuSection {
  id: string;
  label: string;
  expandable?: boolean;
  items: SidebarMenuItem[];
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const menuSections: SidebarMenuSection[] = [
  {
    id: "main",
    label: "Main",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: SALES_ROLES,
      },
      {
        id: "today-revenue",
        label: "Today Revenue",
        icon: BarChart3,
        roles: SALES_ROLES,
      },
      {
        id: "today-cash-sales",
        label: "Today Cash Sales",
        icon: DollarSign,
        roles: SALES_ROLES,
      },
      {
        id: "today-credit-sales",
        label: "Today Credit Sales",
        icon: CreditCard,
        roles: SALES_ROLES,
      },
      {
        id: "today-expenses",
        label: "Today Expenses",
        icon: Receipt,
        roles: SALES_ROLES,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales & Transactions",
    expandable: true,
    items: [
      { id: "new-sale", label: "Sales", icon: ShoppingCart, roles: SALES_ROLES },
      {
        id: "sales-history",
        label: "Sales History",
        icon: History,
        roles: SALES_ROLES,
      },
      {
        id: "returns",
        label: "Returns",
        icon: RotateCcw,
        roles: SALES_ROLES,
      },
      {
        id: "exchanges",
        label: "Exchanges",
        icon: ArrowLeftRight,
        roles: SALES_ROLES,
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    expandable: true,
    items: [
      {
        id: "inventory-dashboard",
        label: "Inventory Dashboard",
        icon: LayoutDashboard,
        roles: INVENTORY_ROLES,
      },
      {
        id: "inventory",
        label: "Products",
        icon: Package,
        roles: INVENTORY_ROLES,
      },
      {
        id: "stock-management",
        label: "Stock Management",
        icon: Warehouse,
        roles: INVENTORY_ROLES,
      },
    ],
  },
  {
    id: "stock-ops",
    label: "Stock Operations",
    expandable: true,
    items: [
      {
        id: "purchases",
        label: "Stock In (Purchases)",
        icon: Package,
        roles: PURCHASE_ROLES,
      },
      {
        id: "stock-out",
        label: "Stock Out",
        icon: Package,
        roles: STOCK_OUT_ROLES,
      },
      {
        id: "stock-adjustment",
        label: "Stock Adjustment",
        icon: Warehouse,
        roles: TRANSFER_ROLES,
      },
      {
        id: "stock-movement-log",
        label: "Movement Log",
        icon: History,
        roles: INVENTORY_ROLES,
      },
      {
        id: "inventory-reports",
        label: "Inventory Reports",
        icon: BarChart3,
        roles: INVENTORY_ROLES,
      },
      {
        id: "inventory-audit",
        label: "Financial Audit",
        icon: Shield,
        roles: INVENTORY_ROLES,
      },
    ],
  },
  {
    id: "catalog",
    label: "Product Catalog",
    expandable: true,
    items: [
      {
        id: "categories",
        label: "Categories",
        icon: Grid3X3,
        roles: BRANCH_DATA_ROLES,
      },
      {
        id: "sub-categories",
        label: "Sub-Categories",
        icon: Grid3X3,
        roles: ADMIN_ROLES,
      },
      { id: "units", label: "Units", icon: Package, roles: ADMIN_ROLES },
      { id: "brand", label: "Brands", icon: StoreIcon, roles: ADMIN_ROLES },
      { id: "colors", label: "Colors", icon: Package, roles: ADMIN_ROLES },
      { id: "sizes", label: "Sizes", icon: Package, roles: ADMIN_ROLES },
      {
        id: "suppliers",
        label: "Suppliers",
        icon: Truck,
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    id: "people",
    label: "Customer & Staff",
    expandable: true,
    items: [
      { id: "customers", label: "Customers", icon: Users, roles: SALES_ROLES },
      { id: "employees", label: "Employees", icon: UserCheck, roles: ADMIN_ROLES },
      // { id: "shifts", label: "Shift Management", icon: Clock, roles: ADMIN_ROLES },
      { id: "salaries", label: "Salaries", icon: CreditCard, roles: ADMIN_ROLES },
      {
        id: "designation",
        label: "Designation",
        icon: Shield,
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    id: "system",
    label: "System & Admin",
    expandable: true,
    items: [
      {
        id: "reports",
        label: "Reports & Analytics",
        icon: BarChart3,
        roles: ADMIN_ROLES,
      },
      {
        id: "expenses",
        label: "Expenses",
        icon: Receipt,
        roles: ADMIN_ROLES,
      },
      {
        id: "product-export",
        label: "Product Export",
        icon: Download,
        roles: ADMIN_ROLES,
      },
      {
        id: "printer-settings",
        label: "Printer Settings",
        icon: PrinterIcon,
        roles: STAFF_ROLES,
      },
      {
        id: "profile",
        label: "Profile Settings",
        icon: User,
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    id: "help",
    label: "Help & Guide",
    items: [
      {
        id: "documentation",
        label: "Documentation",
        icon: BookOpen,
      },
    ],
  },
];

const filterMenuSectionsByRole = (role: UserRole | null): SidebarMenuSection[] => {
  if (role === "SUPER_ADMIN") {
    return menuSections;
  }

  if (!role) {
    return [];
  }

  return menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.includes(role)
      ),
    }))
    .filter((section) => section.items.length > 0);
};

const getVisibleTabIds = (sections: SidebarMenuSection[]) =>
  sections.flatMap((section) => section.items.map((item) => item.id));

/** Tabs rendered by Dashboard but not listed in the sidebar (deep links from other screens). */
const INTERNAL_DASHBOARD_TABS = new Set(["customer-ledger", "supplier-profile", "supplier-ledger"]);

export function Sidebar({
  activeTab,
  setActiveTab,
  onLogout,
  isOpen = true,
  onClose,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "sales",
    "inventory",
    "stock-ops",
    "catalog",
    "people",
    "system",
  ]);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const syncRole = () => {
      setRole(normalizeUserRole(localStorage.getItem("role")));
    };

    syncRole();
    window.addEventListener("storage", syncRole);

    return () => window.removeEventListener("storage", syncRole);
  }, []);

  const filteredMenuSections = filterMenuSectionsByRole(role);

  useEffect(() => {
    const visibleTabIds = getVisibleTabIds(filteredMenuSections);
    if (
      !visibleTabIds.length ||
      visibleTabIds.includes(activeTab) ||
      INTERNAL_DASHBOARD_TABS.has(activeTab)
    ) {
      return;
    }

    const preferredTab = getDefaultDashboardTab(role);
    setActiveTab(
      visibleTabIds.includes(preferredTab) ? preferredTab : visibleTabIds[0]
    );
  }, [activeTab, filteredMenuSections, role, setActiveTab]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((value) => value !== section)
        : [...prev, section]
    );
  };

  const handleMenuClick = (itemId: string) => {
    setActiveTab(itemId);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-72 flex-col border-r border-gray-200 bg-white shadow-sm
          transition-transform duration-300 ease-in-out lg:static
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="absolute right-4 top-4 z-10 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center space-x-3">
            <img src="/logo.jpeg" alt="Logo" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 uppercase">ACE ORBITS</h1>
              <p className="text-sm text-gray-500">Enterprise POS System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {filteredMenuSections.map((section) => (
              <div key={section.id}>
                {section.expandable ? (
                  <div>
                    <Button
                      variant="ghost"
                      className="mb-2 h-8 w-full justify-between text-xs font-semibold uppercase tracking-wider text-gray-500"
                      onClick={() => toggleSection(section.id)}
                    >
                      {section.label}
                      {expandedSections.includes(section.id) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </Button>
                    {expandedSections.includes(section.id) && (
                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const Icon = item.icon;

                          return (
                            <Button
                              key={item.id}
                              variant={activeTab === item.id ? "default" : "ghost"}
                              className={`w-full justify-start pl-6 ${
                                activeTab === item.id
                                  ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                                  : "text-gray-700 hover:bg-gray-100"
                              }`}
                              onClick={() => handleMenuClick(item.id)}
                            >
                              <Icon className="mr-3 h-4 w-4" />
                              {item.label}
                              {item.badge && (
                                <Badge
                                  variant={
                                    item.badge === "Live"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                  className="ml-auto text-xs"
                                >
                                  {item.badge}
                                </Badge>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {section.label}
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const Icon = item.icon;

                        return (
                          <Button
                            key={item.id}
                            variant={activeTab === item.id ? "default" : "ghost"}
                            className={`w-full justify-start ${
                              activeTab === item.id
                                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                            onClick={() => handleMenuClick(item.id)}
                          >
                            <Icon className="mr-3 h-4 w-4" />
                            {item.label}
                            {item.badge && (
                              <Badge
                                variant={
                                  item.badge === "Live"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="ml-auto text-xs"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {section.id !== "system" && <Separator className="mt-4" />}
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={onLogout}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </>
  );
}

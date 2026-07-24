export type NavItem = {
  label: string;
  href: string;
  icon: string; // remixicon class name
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "ri-dashboard-2-line" },
      { label: "Orders", href: "/orders", icon: "ri-shopping-bag-3-line" },
      { label: "Contacts", href: "/contacts", icon: "ri-user-heart-line" },
      { label: "Master Products", href: "/products", icon: "ri-flask-line" },
      { label: "Shipping", href: "/shipping", icon: "ri-ship-2-line" },
      { label: "Payments", href: "/payments", icon: "ri-bank-card-line" },
      { label: "Invoices", href: "/invoices", icon: "ri-file-list-3-line" },
      { label: "Affiliates", href: "/affiliates", icon: "ri-award-line" },
      { label: "Email Marketing", href: "/email-marketing", icon: "ri-mail-send-line" },
    ],
  },
  {
    label: "Growth",
    items: [
      { label: "Social Analytics", href: "/social-analytics", icon: "ri-bar-chart-grouped-line" },
      { label: "AI Blog Tool", href: "/blog-tool", icon: "ri-article-line" },
      { label: "Reddit Marketing", href: "/reddit-marketing", icon: "ri-reddit-line" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Tracking & Pixels", href: "/tracking-pixels", icon: "ri-radar-line" },
      { label: "Webhooks", href: "/webhooks", icon: "ri-plug-line" },
      { label: "Settings", href: "/settings", icon: "ri-settings-3-line" },
    ],
  },
];

import { requireOrg } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { money } from "@/lib/format";
import { createSupplier, setSupplierActive } from "./actions";
import { InviteForm } from "./invite-form";

export default async function SuppliersPage() {
  const { organization } = await requireOrg();

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: organization.id },
    include: {
      products: { where: { active: true } },
      memberships: { include: { user: true } },
      _count: { select: { orderItems: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Dropshipping partners — their own products, stock, and shipping rates" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {suppliers.length === 0 ? (
            <EmptyState
              icon="ri-truck-line"
              title="No suppliers yet"
              body="Add a dropshipping partner, then invite them a login — they'll manage their own product list, stock, and shipping rates from a restricted view."
            />
          ) : (
            suppliers.map((s) => {
              const login = s.memberships[0]?.user;
              const costTotal = s.products.reduce((sum, p) => sum + p.costCents + p.shippingCents, 0);
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground-950">{s.name}</h2>
                        <Badge status={s.active ? "connected" : "pending"} />
                      </div>
                      <p className="text-xs text-foreground-500 mt-0.5">{s.contactEmail || "No contact email"}</p>
                    </div>
                    <form action={setSupplierActive.bind(null, s.id, !s.active)}>
                      <button className="text-xs border border-background-300 rounded-md px-2.5 py-1 text-foreground-700 hover:bg-background-100">
                        {s.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-background-200 text-center">
                    <div>
                      <div className="text-sm font-semibold text-foreground-950 tabular-nums">{s.products.length}</div>
                      <div className="text-[10px] text-foreground-500">Active products</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground-950 tabular-nums">{s._count.orderItems}</div>
                      <div className="text-[10px] text-foreground-500">Items fulfilled</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground-950 tabular-nums">{money(costTotal)}</div>
                      <div className="text-[10px] text-foreground-500">Combined cost+ship</div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-background-200">
                    <p className="text-xs text-foreground-500">
                      {login ? (
                        <>
                          Login: <span className="font-mono text-foreground-800">{login.email}</span>
                        </>
                      ) : (
                        "No login invited yet"
                      )}
                    </p>
                    <InviteForm supplierId={s.id} />
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <Card className="p-4 h-fit">
          <h2 className="text-sm font-semibold text-foreground-950 mb-3">Add a supplier</h2>
          <form action={createSupplier} className="space-y-2">
            <input
              name="name"
              required
              placeholder="Supplier name"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <input
              name="contactEmail"
              type="email"
              placeholder="Contact email (optional)"
              className="w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50"
            />
            <button className="w-full text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
              Add supplier
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

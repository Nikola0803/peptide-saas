import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { money, shortDate } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2 },
  section: { marginBottom: 16 },
  label: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10, marginBottom: 8 },
  table: { marginTop: 8, borderTop: "1px solid #ddd" },
  tableRow: { flexDirection: "row", paddingVertical: 6, borderBottom: "1px solid #eee" },
  tableHeader: { flexDirection: "row", paddingVertical: 6, borderBottom: "1px solid #1a1a1a" },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", width: 180, marginBottom: 4 },
  grandTotal: { fontSize: 12, fontWeight: 700 },
  footer: { marginTop: 32, paddingTop: 12, borderTop: "1px solid #ddd", fontSize: 8, color: "#888" },
});

type DocLine = { description: string; quantity: number; unitPriceCents: number; totalCents: number };

export type BillingDocProps = {
  kind: "Receipt" | "Invoice";
  documentNumber: string;
  brandName: string;
  brandDomain: string;
  issueDate: Date;
  dueDate?: Date | null;
  poNumber?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  lines: DocLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes?: string | null;
  status?: string;
};

export function BillingDocument(props: BillingDocProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{props.kind}</Text>
            <Text style={styles.subtitle}>{props.documentNumber}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: 700 }}>{props.brandName}</Text>
            <Text style={styles.subtitle}>{props.brandDomain}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          <View style={{ maxWidth: 250 }}>
            <Text style={styles.label}>Bill to</Text>
            <Text style={styles.value}>{props.customerName}</Text>
            {props.customerEmail && <Text style={styles.value}>{props.customerEmail}</Text>}
            {props.customerAddress && <Text style={styles.value}>{props.customerAddress}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>Issue date</Text>
            <Text style={styles.value}>{shortDate(props.issueDate)}</Text>
            {props.dueDate && (
              <>
                <Text style={styles.label}>Due date</Text>
                <Text style={styles.value}>{shortDate(props.dueDate)}</Text>
              </>
            )}
            {props.poNumber && (
              <>
                <Text style={styles.label}>PO number</Text>
                <Text style={styles.value}>{props.poNumber}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit price</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {props.lines.map((line, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{money(line.unitPriceCents)}</Text>
              <Text style={styles.colTotal}>{money(line.totalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{money(props.subtotalCents)}</Text>
          </View>
          {props.taxCents > 0 && (
            <View style={styles.totalRow}>
              <Text>Tax</Text>
              <Text>{money(props.taxCents)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.grandTotal}>Total</Text>
            <Text style={styles.grandTotal}>{money(props.totalCents)}</Text>
          </View>
        </View>

        {props.notes && (
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{props.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>
            Products sold are intended for laboratory research use only. Not for human consumption. Not evaluated
            by the FDA for any medical use.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderBillingPdf(props: BillingDocProps): Promise<Buffer> {
  return renderToBuffer(<BillingDocument {...props} />);
}

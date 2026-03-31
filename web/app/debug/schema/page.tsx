import { query } from "@/lib/db";

interface TableName {
  name: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  row_count: number;
}

export default function SchemaPage() {
  const tables = query<TableName>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  const tableInfos: TableInfo[] = tables.map((t) => {
    const columns = query<ColumnInfo>(`PRAGMA table_info(${t.name})`);
    const countResult = query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM ${t.name}`);
    return {
      name: t.name,
      columns,
      row_count: countResult[0]?.cnt ?? 0,
    };
  });

  return (
    <div>
      <div className="page-header">
        <h1>DB Schema</h1>
        <p>Live schema inspection of shop.db — {tables.length} tables</p>
      </div>

      {tableInfos.map((t) => (
        <div key={t.name} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div>
              <code style={{ fontSize: "16px", fontWeight: 700 }}>{t.name}</code>
            </div>
            <span className="badge badge-neutral">{t.row_count.toLocaleString()} rows</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Column</th>
                  <th>Type</th>
                  <th>Not Null</th>
                  <th>Default</th>
                  <th>PK</th>
                </tr>
              </thead>
              <tbody>
                {t.columns.map((col) => (
                  <tr key={col.cid}>
                    <td style={{ color: "var(--muted)" }}>{col.cid}</td>
                    <td><strong>{col.name}</strong></td>
                    <td><code>{col.type || "—"}</code></td>
                    <td>{col.notnull ? "✓" : ""}</td>
                    <td style={{ color: "var(--muted)" }}>{col.dflt_value ?? "—"}</td>
                    <td>{col.pk ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

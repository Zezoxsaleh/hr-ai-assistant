import React from "react";

// Generic table. `columns` is [{ key, header, render? }], `data` is an array
// of row objects. Pass onRowClick to make rows clickable. `header` is an
// optional node rendered inside the panel above the table (e.g. a panel-title
// row with its own controls).
export default function DataTable({ columns, data, onRowClick, emptyLabel = "No data found.", header }) {
  return (
    <div className="panel table-panel">
      {header}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.id ?? i}
                className={onRowClick ? "clickable" : ""}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.length && <div className="empty">{emptyLabel}</div>}
    </div>
  );
}

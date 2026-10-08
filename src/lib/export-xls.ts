function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cell(value: string | number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${esc(String(value))}</Data></Cell>`;
}

export function downloadXls(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const header = `<Row>${headers.map(cell).join('')}</Row>`;
  const body = rows.map((row) => `<Row>${row.map(cell).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="FUTOI">
  <Table>${header}${body}</Table>
 </Worksheet>
</Workbook>`;
  const blob = new Blob([`\uFEFF${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatCabinetTs(ts: string): string {
  if (ts.length < 16) return ts;
  return `${ts.slice(8, 10)}.${ts.slice(5, 7)}.${ts.slice(0, 4)} ${ts.slice(11, 16)}`;
}

export function formatRuInt(value: number): string {
  return Math.round(value).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
}

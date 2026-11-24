import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type Grid, str } from "../core";
import reportFont from "../assets/ReportSans.ttf?inline";
import { saveBlob } from "./download";
export function pdfReport(
  title: string,
  g: Grid,
  chart?: string,
  summary = "",
) {
  if (g.rows.length * g.cols.length > 60000 || g.cols.length > 40)
    throw Error("pdfLimit");
  const pdf = new jsPDF({
    orientation: g.cols.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.addFileToVFS("ReportSans.ttf", reportFont.split(",")[1]);
  pdf.addFont("ReportSans.ttf", "Studio", "normal");
  pdf.setFont("Studio");
  pdf.setFontSize(17);
  const width = pdf.internal.pageSize.getWidth() - 28;
  const lines = pdf.splitTextToSize(title, width);
  pdf.text(lines, 14, 20);
  let y = 24 + lines.length * 6;
  pdf.setFontSize(10);
  if (summary) {
    const note = pdf.splitTextToSize(summary, width);
    pdf.text(note, 14, y);
    y += 4 + note.length * 4;
  }
  if (chart) {
    const props = pdf.getImageProperties(chart),
      height = (width * props.height) / props.width;
    pdf.addImage(chart, "PNG", 14, y, width, height);
    y += height + 6;
  }
  autoTable(pdf, {
    startY: y,
    head: [g.cols],
    body: g.rows.map((r) => r.map(str)),
    styles: {
      font: "Studio",
      fontStyle: "normal",
      fontSize: 8,
      overflow: "linebreak",
    },
    headStyles: { fillColor: "#5446a7", fontStyle: "normal" },
    horizontalPageBreak: true,
    margin: { left: 14, right: 14 },
  });
  saveBlob(pdf.output("blob"), title + ".pdf");
}

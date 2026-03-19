const docx = require("docx");
const fs = require("fs");
const minimist = require("minimist");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  UnderlineType,
} = docx;

const args = minimist(process.argv.slice(2));
const inputPath = args.input;
const outputPath = args.output || "document.docx";

if (!inputPath) {
  console.error("Error: --input JSON file path is required.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const createDoc = async () => {
  const isCongVan = data.loai_van_ban === "cong_van";

  // Configuration for NĐ30 Standards
  const font = "Times New Roman";
  const fontSizeNormal = 13 * 2; // docx uses half-points
  const fontSizeHeader = 12 * 2;
  const fontSizeMotto = 13 * 2;

  // Header Table (Standard NĐ30)
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                   new TextRun({ text: data.co_quan_chu_quan || "TÊN CƠ QUAN CHỦ QUẢN", size: fontSizeHeader, font: font }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: data.co_quan_ban_hanh || "TÊN CƠ QUAN BAN HÀNH", size: fontSizeHeader, bold: true, font: font }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { bottom: { color: "000000", space: 1, value: "single", size: 6 } }, // Header bar (Black color hex 000000)
                children: [
                   new TextRun({ text: `Số: .../${data.don_vi_soan_thao || "VH"}`, size: fontSizeHeader, font: font }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", size: fontSizeMotto, bold: true, font: font }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Độc lập - Tự do - Hạnh phúc", size: fontSizeMotto, bold: true, font: font }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "–––––––––––––––––––––––", // Standard long bar for motto
                    size: fontSizeHeader,
                    bold: true,
                    font: font,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${data.dia_danh || "Hà Nội"}, ngày ... tháng ... năm 202...`, size: fontSizeNormal, italics: true, font: font, }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const bodyContent = [];

  if (isCongVan) {
    // Trich yeu Cong van
    bodyContent.push(new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.LEFT, children: [ new TextRun({ text: "V/v: " + data.trich_yeu, size: fontSizeNormal, font: font }) ] }));
    
    // Kinh gui
    const kinhGuiLines = Array.isArray(data.kinh_gui) ? data.kinh_gui : [data.kinh_gui];
    bodyContent.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 240 }, children: [ new TextRun({ text: "Kính gửi: ", size: fontSizeNormal, bold: true, font: font }) ] }));
    kinhGuiLines.forEach(line => {
       bodyContent.push(new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 720 }, children: [ new TextRun({ text: "- " + line, size: fontSizeNormal, font: font }) ] }));
    });
  } else {
    // Quyết định
    bodyContent.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [ new TextRun({ text: "QUYẾT ĐỊNH", size: fontSizeNormal + 4, bold: true, font: font }) ] }));
    bodyContent.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [ new TextRun({ text: data.trich_yeu, size: fontSizeNormal, bold: true, font: font }) ] }));
    
    if (data.can_cu) {
      data.can_cu.forEach(cc => {
        bodyContent.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [ new TextRun({ text: "Căn cứ " + cc + ";", size: fontSizeNormal, italics: true, font: font }) ] }));
      });
    }
  }

  // Nội dung chính
  bodyContent.push(new Paragraph({ spacing: { before: 300, after: 300 }, alignment: AlignmentType.JUSTIFY, children: [ new TextRun({ text: data.noi_dung, size: fontSizeNormal, font: font }) ] }));

  // Signature Block
  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.LEFT, children: [ new TextRun({ text: "Nơi nhận:", size: 12 * 2, bold: true, italics: true, font: font }) ] }),
              ...(data.noi_nhan || []).map(nn => new Paragraph({ alignment: AlignmentType.LEFT, children: [ new TextRun({ text: nn, size: 11 * 2, font: font }) ] })),
            ],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: data.cap_ky || "", size: fontSizeNormal, bold: true, font: font }) ] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: data.chuc_vu_ky || "CHỨC VỤ", size: fontSizeNormal, bold: true, font: font }) ] }),
              new Paragraph({ height: { value: 1200, rule: "atLeast" }, children: [] }), // Signature space
              new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: data.nguoi_ky || "Họ và tên", size: fontSizeNormal, bold: true, font: font }) ] }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 850, bottom: 1134, left: 1700 }, // 20mm/15mm/20mm/30mm roughly
        },
      },
      children: [
        headerTable,
        ...bodyContent,
        sigTable,
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document saved to ${outputPath}`);
};

createDoc().catch(err => console.error(err));

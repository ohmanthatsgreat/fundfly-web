import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  PageBreak,
  Packer,
} from "docx";

type Section = {
  sectionTitle: string;
  content: string;
};

type AppMeta = {
  title: string;
  agency: string | null;
  deadline: string | null;
  orgName?: string;
};

export async function generateApplicationDocx(
  sections: Section[],
  meta: AppMeta
): Promise<Blob> {
  const children: Paragraph[] = [];

  // Title page
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000 },
      children: [
        new TextRun({
          text: meta.title,
          bold: true,
          size: 48,
          font: "Calibri",
        }),
      ],
    })
  );

  if (meta.agency) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [
          new TextRun({
            text: meta.agency,
            size: 28,
            color: "666666",
            font: "Calibri",
          }),
        ],
      })
    );
  }

  if (meta.orgName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [
          new TextRun({
            text: `Submitted by: ${meta.orgName}`,
            size: 24,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  if (meta.deadline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [
          new TextRun({
            text: `Deadline: ${new Date(meta.deadline).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
            size: 22,
            color: "888888",
            font: "Calibri",
          }),
        ],
      })
    );
  }

  // Page break after title
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  // Sections
  for (const section of sections) {
    // Section heading
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
        },
        children: [
          new TextRun({
            text: section.sectionTitle,
            bold: true,
            size: 28,
            font: "Calibri",
          }),
        ],
      })
    );

    // Section content — split by paragraphs
    const paragraphs = section.content.split(/\n\n+/);
    for (const para of paragraphs) {
      if (!para.trim()) continue;

      // Handle bullet points
      if (para.trim().startsWith("- ") || para.trim().startsWith("• ")) {
        const bullets = para.split("\n").filter((l) => l.trim());
        for (const bullet of bullets) {
          const text = bullet.replace(/^[-•]\s*/, "").trim();
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { before: 60, after: 60 },
              children: [
                new TextRun({
                  text,
                  size: 22,
                  font: "Calibri",
                }),
              ],
            })
          );
        }
      } else {
        // Regular paragraph
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [
              new TextRun({
                text: para.replace(/\n/g, " ").trim(),
                size: 22,
                font: "Calibri",
              }),
            ],
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

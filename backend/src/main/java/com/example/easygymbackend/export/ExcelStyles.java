package com.example.easygymbackend.export;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.awt.Color;

/**
 * Style/formaty wspólne dla wszystkich arkuszy eksportu (sekcja 7 promptu:
 * nagłówek pogrubiony/biały-na-ciemnym/zamrożony, autoFilter, formaty liczb,
 * PR podświetlony, ujemne delty na czerwono/dodatnie na zielono). Jedno
 * miejsce, żeby wszystkie arkusze wyglądały spójnie.
 */
final class ExcelStyles {

    private final CellStyle headerStyle;
    private final CellStyle dateStyle;
    private final CellStyle weightStyle;
    private final CellStyle percentStyle;
    private final CellStyle prHighlightStyle;
    private final CellStyle positiveDeltaStyle;
    private final CellStyle negativeDeltaStyle;
    private final CellStyle defaultStyle;

    ExcelStyles(XSSFWorkbook workbook) {
        Font headerFont = workbook.createFont();
        headerFont.setBold(true);
        headerFont.setColor(IndexedColors.WHITE.getIndex());

        headerStyle = workbook.createCellStyle();
        headerStyle.setFont(headerFont);
        ((XSSFCellStyle) headerStyle).setFillForegroundColor(new XSSFColor(new Color(0x2F, 0x35, 0x42), null));
        headerStyle.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.SOLID_FOREGROUND);
        headerStyle.setAlignment(HorizontalAlignment.CENTER);
        headerStyle.setBorderBottom(BorderStyle.THIN);

        dateStyle = workbook.createCellStyle();
        dateStyle.setDataFormat(workbook.createDataFormat().getFormat("dd.mm.yyyy"));

        weightStyle = workbook.createCellStyle();
        weightStyle.setDataFormat(workbook.createDataFormat().getFormat("0.00 \"kg\""));

        percentStyle = workbook.createCellStyle();
        percentStyle.setDataFormat(workbook.createDataFormat().getFormat("0.0%"));

        prHighlightStyle = workbook.createCellStyle();
        ((XSSFCellStyle) prHighlightStyle).setFillForegroundColor(new XSSFColor(new Color(0xFF, 0xF4, 0xCE), null));
        prHighlightStyle.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.SOLID_FOREGROUND);

        positiveDeltaStyle = workbook.createCellStyle();
        Font positiveFont = workbook.createFont();
        positiveFont.setColor(IndexedColors.GREEN.getIndex());
        positiveDeltaStyle.setFont(positiveFont);

        negativeDeltaStyle = workbook.createCellStyle();
        Font negativeFont = workbook.createFont();
        negativeFont.setColor(IndexedColors.RED.getIndex());
        negativeDeltaStyle.setFont(negativeFont);

        defaultStyle = workbook.createCellStyle();
    }

    CellStyle header() {
        return headerStyle;
    }

    CellStyle date() {
        return dateStyle;
    }

    CellStyle weight() {
        return weightStyle;
    }

    CellStyle percent() {
        return percentStyle;
    }

    CellStyle prHighlight() {
        return prHighlightStyle;
    }

    CellStyle plain() {
        return defaultStyle;
    }

    /** Zielony dla >=0, czerwony dla <0 -- delty tydzień-do-tygodnia i przyrosty w Progresie ćwiczeń. */
    CellStyle deltaStyle(double value) {
        return value < 0 ? negativeDeltaStyle : positiveDeltaStyle;
    }

    static void writeHeaderRow(Sheet sheet, ExcelStyles styles, String... columns) {
        Row header = sheet.createRow(0);
        for (int i = 0; i < columns.length; i++) {
            var cell = header.createCell(i);
            cell.setCellValue(columns[i]);
            cell.setCellStyle(styles.header());
        }
        sheet.createFreezePane(0, 1);
        sheet.setAutoFilter(new CellRangeAddress(0, 0, 0, columns.length - 1));
    }

    static void autoSizeColumns(Sheet sheet, int columnCount) {
        for (int i = 0; i < columnCount; i++) {
            sheet.autoSizeColumn(i);
            // autoSizeColumn bywa zbyt ciasny dla nagłówków z polskimi znakami -- mały zapas.
            sheet.setColumnWidth(i, sheet.getColumnWidth(i) + 512);
        }
    }

}

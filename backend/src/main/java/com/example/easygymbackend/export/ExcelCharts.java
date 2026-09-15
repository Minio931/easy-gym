package com.example.easygymbackend.export;

import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.chart.AxisCrosses;
import org.apache.poi.xddf.usermodel.chart.AxisPosition;
import org.apache.poi.xddf.usermodel.chart.BarDirection;
import org.apache.poi.xddf.usermodel.chart.ChartTypes;
import org.apache.poi.xddf.usermodel.chart.XDDFBarChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFCategoryAxis;
import org.apache.poi.xddf.usermodel.chart.XDDFChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFDataSource;
import org.apache.poi.xddf.usermodel.chart.XDDFDataSourcesFactory;
import org.apache.poi.xddf.usermodel.chart.XDDFLineChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFNumericalDataSource;
import org.apache.poi.xddf.usermodel.chart.XDDFValueAxis;
import org.apache.poi.xssf.usermodel.XSSFChart;
import org.apache.poi.xssf.usermodel.XSSFDrawing;
import org.apache.poi.xssf.usermodel.XSSFSheet;

/**
 * Prawdziwe wykresy Excela (XDDF), nie obrazki -- to jest powód dla którego
 * eksport w ogóle idzie przez Apache POI (sekcja 1/7 promptu). Kategorie i
 * wartości muszą być już zapisane w arkuszu PRZED wywołaniem tych metod --
 * XDDF referencjonuje zakresy komórek, nie dostaje danych bezpośrednio.
 */
final class ExcelCharts {

    private ExcelCharts() {
    }

    static void addBarChart(
            XSSFSheet sheet, int anchorRow, int anchorCol, String title,
            String seriesName, int categoryColumn, int valueColumn, int firstDataRow, int lastDataRow
    ) {
        if (lastDataRow < firstDataRow) {
            return;
        }

        XSSFDrawing drawing = sheet.createDrawingPatriarch();
        var anchor = drawing.createAnchor(0, 0, 0, 0, anchorCol, anchorRow, anchorCol + 8, anchorRow + 15);
        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText(title);
        chart.setTitleOverlay(false);

        XDDFCategoryAxis categoryAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis valueAxis = chart.createValueAxis(AxisPosition.LEFT);
        valueAxis.setCrosses(AxisCrosses.AUTO_ZERO);

        XDDFDataSource<String> categories = XDDFDataSourcesFactory.fromStringCellRange(
                sheet, new CellRangeAddress(firstDataRow, lastDataRow, categoryColumn, categoryColumn));
        XDDFNumericalDataSource<Double> values = XDDFDataSourcesFactory.fromNumericCellRange(
                sheet, new CellRangeAddress(firstDataRow, lastDataRow, valueColumn, valueColumn));

        XDDFChartData chartData = chart.createData(ChartTypes.BAR, categoryAxis, valueAxis);
        XDDFChartData.Series series = chartData.addSeries(categories, values);
        series.setTitle(seriesName, null);
        ((XDDFBarChartData) chartData).setBarDirection(BarDirection.COL);
        chart.plot(chartData);
    }

    static void addLineChart(
            XSSFSheet sheet, int anchorRow, int anchorCol, String title,
            String seriesName, int categoryColumn, int valueColumn, int firstDataRow, int lastDataRow
    ) {
        if (lastDataRow < firstDataRow) {
            return;
        }

        XSSFDrawing drawing = sheet.createDrawingPatriarch();
        var anchor = drawing.createAnchor(0, 0, 0, 0, anchorCol, anchorRow, anchorCol + 8, anchorRow + 15);
        XSSFChart chart = drawing.createChart(anchor);
        chart.setTitleText(title);
        chart.setTitleOverlay(false);

        XDDFCategoryAxis categoryAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis valueAxis = chart.createValueAxis(AxisPosition.LEFT);
        valueAxis.setCrosses(AxisCrosses.AUTO_ZERO);

        XDDFDataSource<String> categories = XDDFDataSourcesFactory.fromStringCellRange(
                sheet, new CellRangeAddress(firstDataRow, lastDataRow, categoryColumn, categoryColumn));
        XDDFNumericalDataSource<Double> values = XDDFDataSourcesFactory.fromNumericCellRange(
                sheet, new CellRangeAddress(firstDataRow, lastDataRow, valueColumn, valueColumn));

        XDDFChartData chartData = chart.createData(ChartTypes.LINE, categoryAxis, valueAxis);
        XDDFChartData.Series series = chartData.addSeries(categories, values);
        series.setTitle(seriesName, null);
        ((XDDFLineChartData.Series) series).setSmooth(false);
        chart.plot(chartData);
    }

}

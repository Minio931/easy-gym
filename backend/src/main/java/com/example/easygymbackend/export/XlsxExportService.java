package com.example.easygymbackend.export;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.bodyweight.BodyWeight;
import com.example.easygymbackend.bodyweight.BodyWeightRepository;
import com.example.easygymbackend.metrics.BodyWeightAggregator;
import com.example.easygymbackend.metrics.BodyWeightEntry;
import com.example.easygymbackend.metrics.ExerciseSet;
import com.example.easygymbackend.metrics.IsoWeek;
import com.example.easygymbackend.metrics.OneRepMax;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.metrics.PersonalRecordCalculator;
import com.example.easygymbackend.metrics.PersonalRecords;
import com.example.easygymbackend.metrics.SessionMetrics;
import com.example.easygymbackend.metrics.WeeklyBodyWeightAverage;
import com.example.easygymbackend.workout.MetricsConversion;
import com.example.easygymbackend.workout.WorkoutSessionGroup;
import com.example.easygymbackend.workout.WorkoutSessionGrouper;
import com.example.easygymbackend.workout.WorkoutSet;
import com.example.easygymbackend.workout.WorkoutSetRepository;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Eksport XLSX (sekcja 7 promptu) -- Apache POI po stronie Springa, 6
 * arkuszy, natywne wykresy Excela na Podsumowaniu/Progresie ćwiczeń/Wadze
 * tygodniowo (nie PNG, nie tylko dane pod tabelę przestawną -- to był powód
 * wyboru POI zamiast frontowej biblioteki do eksportu).
 *
 * Dwa różne zakresy PR w tym samym eksporcie, celowo:
 * - "czy PR" w arkuszu Serie i lista PR w Podsumowaniu = CAŁA historia usera
 *   (niezależnie od filtra dat eksportu) -- inaczej ta sama seria byłaby raz
 *   PR-em, raz nie, zależnie jaki zakres dat akurat wybrano przy eksporcie,
 *   co jest myląco niestabilne dla arkusza źródłowego pod tabele przestawne.
 * - "najlepszy ciężar/e1RM" w arkuszu Progres ćwiczeń = TYLKO w obrębie
 *   filtra eksportu -- to raport za dany okres, ma sens że pokazuje best
 *   z TEGO okresu, nie best z całej historii konta.
 */
@Service
public class XlsxExportService {

    private static final DateTimeFormatter DATE_RANGE_FORMAT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final Locale POLISH = Locale.forLanguageTag("pl");

    private final WorkoutSetRepository workoutSetRepository;
    private final BodyWeightRepository bodyWeightRepository;

    public XlsxExportService(WorkoutSetRepository workoutSetRepository, BodyWeightRepository bodyWeightRepository) {
        this.workoutSetRepository = workoutSetRepository;
        this.bodyWeightRepository = bodyWeightRepository;
    }

    // @Transactional(readOnly=true) -- budowanie arkuszy nawiguje leniwe
    // relacje (workoutExercise.exercise/.workout) na dziesiątkach/setkach
    // serii naraz, patrz identyczna uwaga przy ExerciseProgressService.
    @Transactional(readOnly = true)
    public byte[] export(ExportFilter filter, OneRepMaxFormula formula) {
        UUID userId = CurrentUser.id();

        Map<UUID, List<String>> allTimePrCategoriesBySetId = computeAllTimePrCategories(userId, formula);

        Instant from = filter.effectiveFrom().atStartOfDay(IsoWeek.WARSAW).toInstant();
        Instant toExclusive = filter.effectiveTo().plusDays(1).atStartOfDay(IsoWeek.WARSAW).toInstant();

        List<WorkoutSet> filteredSets = workoutSetRepository.findForExport(userId, from, toExclusive).stream()
                .filter(s -> filter.matchesExercise(s.getWorkoutExercise().getExercise().getId()))
                .filter(s -> !filter.workingSetsOnly() || !s.isWarmup())
                .toList();

        List<BodyWeight> bodyWeights = bodyWeightRepository.findAllVisibleTo(userId).stream()
                .filter(b -> !b.getMeasuredOn().isBefore(filter.effectiveFrom()) && !b.getMeasuredOn().isAfter(filter.effectiveTo()))
                .toList();

        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            ExcelStyles styles = new ExcelStyles(workbook);

            XSSFSheet summarySheet = workbook.createSheet("Podsumowanie");
            XSSFSheet workoutsSheet = workbook.createSheet("Treningi");
            XSSFSheet setsSheet = workbook.createSheet("Serie");
            XSSFSheet progressSheet = workbook.createSheet("Progres ćwiczeń");
            XSSFSheet bodyWeightSheet = workbook.createSheet("Waga ciała");
            XSSFSheet weeklySheet = workbook.createSheet("Waga tygodniowo");

            writeWorkoutsSheet(workoutsSheet, styles, filteredSets);
            writeSetsSheet(setsSheet, styles, filteredSets, allTimePrCategoriesBySetId, formula);
            writeExerciseProgressSheet(progressSheet, styles, filteredSets, formula);
            writeBodyWeightSheet(bodyWeightSheet, styles, bodyWeights);
            writeWeeklyBodyWeightSheet(weeklySheet, styles, bodyWeights);
            writeSummarySheet(summarySheet, styles, filter, filteredSets, bodyWeights, allTimePrCategoriesBySetId);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Nie udało się wygenerować pliku XLSX", e);
        }
    }

    // --- Arkusz: Serie -------------------------------------------------

    private void writeSetsSheet(
            XSSFSheet sheet, ExcelStyles styles, List<WorkoutSet> sets,
            Map<UUID, List<String>> prCategoriesBySetId, OneRepMaxFormula formula
    ) {
        String[] columns = {
                "Data", "Ćwiczenie", "Grupa mięśniowa", "Nr serii", "Ciężar (kg)", "Powtórzenia", "RPE",
                "Objętość (kg)", "e1RM (kg)", "Rozgrzewkowa", "Do odmowy", "Wspomagana", "PR"
        };
        ExcelStyles.writeHeaderRow(sheet, styles, columns);

        int rowIndex = 1;
        for (WorkoutSet s : sets) {
            Row row = sheet.createRow(rowIndex);
            boolean isPr = prCategoriesBySetId.containsKey(s.getId());

            setDateCell(row, 0, styles, toWarsawDate(s.getCompletedAt()));
            row.createCell(1).setCellValue(s.getWorkoutExercise().getExercise().getName());
            row.createCell(2).setCellValue(s.getWorkoutExercise().getExercise().getMuscleGroup());
            row.createCell(3).setCellValue(s.getSetIndex());
            setWeightCell(row, 4, styles, s.getWeightKg());
            row.createCell(5).setCellValue(s.getReps());
            if (s.getRpe() != null) {
                row.createCell(6).setCellValue(s.getRpe().doubleValue());
            }
            setWeightCell(row, 7, styles, s.getWeightKg().multiply(BigDecimal.valueOf(s.getReps())));
            OneRepMax.estimate(s.getWeightKg(), s.getReps(), formula)
                    .ifPresent(e1rm -> setWeightCell(row, 8, styles, e1rm));
            row.createCell(9).setCellValue(s.isWarmup());
            row.createCell(10).setCellValue(s.isToFailure());
            row.createCell(11).setCellValue(s.isAssisted());
            row.createCell(12).setCellValue(isPr);

            if (isPr) {
                for (int c = 0; c < columns.length; c++) {
                    row.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK).setCellStyle(styles.prHighlight());
                }
            }

            rowIndex++;
        }

        ExcelStyles.autoSizeColumns(sheet, columns.length);
        addNamedRange(sheet, "SerieDane", columns.length, rowIndex - 1);
    }

    // --- Arkusz: Treningi ------------------------------------------------

    private void writeWorkoutsSheet(XSSFSheet sheet, ExcelStyles styles, List<WorkoutSet> filteredSets) {
        String[] columns = {"Data", "Dzień tygodnia", "Czas trwania (min)", "Ćwiczenia", "Liczba serii", "Objętość (kg)", "Deload"};
        ExcelStyles.writeHeaderRow(sheet, styles, columns);

        List<WorkoutSessionGroup> sessions = WorkoutSessionGrouper.groupByWorkout(filteredSets);

        int rowIndex = 1;
        for (WorkoutSessionGroup session : sessions) {
            Row row = sheet.createRow(rowIndex);
            LocalDate date = toWarsawDate(session.startedAt());

            var workout = session.rawSets().get(0).getWorkoutExercise().getWorkout();
            Instant endedAt = workout.getEndedAt();

            LinkedHashSet<String> exerciseNames = new LinkedHashSet<>();
            for (WorkoutSet s : session.rawSets()) {
                exerciseNames.add(s.getWorkoutExercise().getExercise().getName());
            }

            setDateCell(row, 0, styles, date);
            row.createCell(1).setCellValue(polishDayName(date));
            if (endedAt != null) {
                row.createCell(2).setCellValue(Duration.between(session.startedAt(), endedAt).toMinutes());
            }
            row.createCell(3).setCellValue(String.join(", ", exerciseNames));
            row.createCell(4).setCellValue(session.rawSets().size());
            setWeightCell(row, 5, styles, SessionMetrics.displayVolumeKg(MetricsConversion.toMetricsSets(session.rawSets())));
            row.createCell(6).setCellValue(session.deload());

            rowIndex++;
        }

        ExcelStyles.autoSizeColumns(sheet, columns.length);
    }

    // --- Arkusz: Progres ćwiczeń ------------------------------------------

    private void writeExerciseProgressSheet(
            XSSFSheet sheet, ExcelStyles styles, List<WorkoutSet> filteredSets, OneRepMaxFormula formula
    ) {
        String[] columns = {
                "Ćwiczenie", "Grupa mięśniowa", "Pierwszy wynik (kg)", "Pierwszy wynik (powt.)", "Pierwsza data",
                "Ostatni wynik (kg)", "Ostatni wynik (powt.)", "Ostatnia data",
                "Najlepszy ciężar (kg)", "Najlepszy e1RM (kg)", "Przyrost (kg)", "Przyrost (%)"
        };
        ExcelStyles.writeHeaderRow(sheet, styles, columns);

        Map<UUID, List<WorkoutSet>> byExercise = new LinkedHashMap<>();
        for (WorkoutSet s : filteredSets) {
            byExercise.computeIfAbsent(s.getWorkoutExercise().getExercise().getId(), id -> new ArrayList<>()).add(s);
        }

        int rowIndex = 1;
        for (List<WorkoutSet> exerciseSets : byExercise.values()) {
            List<WorkoutSessionGroup> sessions = WorkoutSessionGrouper.groupByWorkout(exerciseSets);

            Optional<HeaviestPoint> first = Optional.empty();
            Optional<HeaviestPoint> last = Optional.empty();
            for (WorkoutSessionGroup session : sessions) {
                Optional<HeaviestPoint> point = heaviestPoint(session);
                if (point.isPresent()) {
                    if (first.isEmpty()) {
                        first = point;
                    }
                    last = point;
                }
            }
            if (first.isEmpty()) {
                continue;
            }

            List<PersonalRecordCalculator.Session> prSessions = sessions.stream()
                    .map(s -> new PersonalRecordCalculator.Session(s.workoutId(), MetricsConversion.toMetricsSets(s.rawSets())))
                    .toList();
            PersonalRecords records = PersonalRecordCalculator.compute(prSessions, formula);

            var exercise = exerciseSets.get(0).getWorkoutExercise().getExercise();
            HeaviestPoint firstPoint = first.get();
            HeaviestPoint lastPoint = last.get();
            BigDecimal gainKg = lastPoint.weightKg().subtract(firstPoint.weightKg());
            BigDecimal gainPercent = firstPoint.weightKg().compareTo(BigDecimal.ZERO) == 0
                    ? BigDecimal.ZERO
                    : gainKg.divide(firstPoint.weightKg(), 6, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));

            Row row = sheet.createRow(rowIndex);
            row.createCell(0).setCellValue(exercise.getName());
            row.createCell(1).setCellValue(exercise.getMuscleGroup());
            setWeightCell(row, 2, styles, firstPoint.weightKg());
            row.createCell(3).setCellValue(firstPoint.reps());
            setDateCell(row, 4, styles, firstPoint.date());
            setWeightCell(row, 5, styles, lastPoint.weightKg());
            row.createCell(6).setCellValue(lastPoint.reps());
            setDateCell(row, 7, styles, lastPoint.date());
            records.maxWeight().ifPresent(e -> setWeightCell(row, 8, styles, e.value()));
            records.maxE1rm().ifPresent(e -> setWeightCell(row, 9, styles, e.value()));

            Cell gainCell = row.createCell(10);
            gainCell.setCellValue(gainKg.doubleValue());
            gainCell.setCellStyle(styles.deltaStyle(gainKg.doubleValue()));

            Cell gainPercentCell = row.createCell(11);
            gainPercentCell.setCellValue(gainPercent.doubleValue() / 100.0);
            gainPercentCell.setCellStyle(styles.deltaStyle(gainPercent.doubleValue()));

            rowIndex++;
        }

        ExcelStyles.autoSizeColumns(sheet, columns.length);

        if (rowIndex > 1) {
            ExcelCharts.addBarChart(sheet, rowIndex + 2, 0, "Przyrost ciężaru (kg)", "Przyrost", 0, 10, 1, rowIndex - 1);
        }
    }

    private record HeaviestPoint(BigDecimal weightKg, int reps, LocalDate date) {
    }

    private Optional<HeaviestPoint> heaviestPoint(WorkoutSessionGroup session) {
        List<ExerciseSet> metricsSets = MetricsConversion.toMetricsSets(session.rawSets());
        return SessionMetrics.heaviestSet(metricsSets)
                .map(h -> new HeaviestPoint(h.weightKg(), h.reps(), toWarsawDate(session.startedAt())));
    }

    // --- Arkusz: Waga ciała ------------------------------------------------

    private void writeBodyWeightSheet(XSSFSheet sheet, ExcelStyles styles, List<BodyWeight> bodyWeights) {
        String[] columns = {"Data", "Waga (kg)", "Średnia krocząca 7 dni (kg)"};
        ExcelStyles.writeHeaderRow(sheet, styles, columns);

        List<BodyWeightEntry> entries = bodyWeights.stream()
                .map(b -> new BodyWeightEntry(b.getMeasuredOn(), b.getWeightKg()))
                .toList();
        Map<LocalDate, BigDecimal> rollingAverage = BodyWeightAggregator.sevenDayRollingAverage(entries);

        int rowIndex = 1;
        for (BodyWeight b : bodyWeights) {
            Row row = sheet.createRow(rowIndex);
            setDateCell(row, 0, styles, b.getMeasuredOn());
            setWeightCell(row, 1, styles, b.getWeightKg());
            BigDecimal avg = rollingAverage.get(b.getMeasuredOn());
            if (avg != null) {
                setWeightCell(row, 2, styles, avg);
            }
            rowIndex++;
        }

        ExcelStyles.autoSizeColumns(sheet, columns.length);
    }

    // --- Arkusz: Waga tygodniowo --------------------------------------------

    private void writeWeeklyBodyWeightSheet(XSSFSheet sheet, ExcelStyles styles, List<BodyWeight> bodyWeights) {
        String[] columns = {"Rok", "Tydzień ISO", "Zakres dat", "Liczba pomiarów", "Średnia (kg)", "Delta (kg)", "Delta (%)"};
        ExcelStyles.writeHeaderRow(sheet, styles, columns);

        List<BodyWeightEntry> entries = bodyWeights.stream()
                .map(b -> new BodyWeightEntry(b.getMeasuredOn(), b.getWeightKg()))
                .toList();
        List<WeeklyBodyWeightAverage> weeks = BodyWeightAggregator.weeklyAverages(entries);

        int rowIndex = 1;
        for (WeeklyBodyWeightAverage week : weeks) {
            Row row = sheet.createRow(rowIndex);
            row.createCell(0).setCellValue(week.week().year());
            row.createCell(1).setCellValue(week.week().week());
            row.createCell(2).setCellValue(
                    week.week().mondayStart().format(DATE_RANGE_FORMAT) + " - " + week.week().sundayEnd().format(DATE_RANGE_FORMAT));
            row.createCell(3).setCellValue(week.measurementCount());
            setWeightCell(row, 4, styles, week.averageKg());

            BodyWeightAggregator.weekOverWeekDeltaKg(weeks, week.week()).ifPresent(delta -> {
                Cell cell = row.createCell(5);
                cell.setCellValue(delta.doubleValue());
                cell.setCellStyle(styles.deltaStyle(delta.doubleValue()));
            });
            BodyWeightAggregator.weekOverWeekDeltaPercent(weeks, week.week()).ifPresent(delta -> {
                Cell cell = row.createCell(6);
                cell.setCellValue(delta.doubleValue() / 100.0);
                cell.setCellStyle(styles.deltaStyle(delta.doubleValue()));
            });

            if (week.incomplete()) {
                row.getCell(3).setCellStyle(styles.prHighlight());
            }

            rowIndex++;
        }

        ExcelStyles.autoSizeColumns(sheet, columns.length);

        if (rowIndex > 1) {
            ExcelCharts.addLineChart(sheet, rowIndex + 2, 0, "Średnia waga tygodniowo", "Waga (kg)", 2, 4, 1, rowIndex - 1);
        }
    }

    // --- Arkusz: Podsumowanie ------------------------------------------------

    private void writeSummarySheet(
            XSSFSheet sheet, ExcelStyles styles, ExportFilter filter, List<WorkoutSet> filteredSets,
            List<BodyWeight> bodyWeights, Map<UUID, List<String>> prCategoriesBySetId
    ) {
        int row = 0;
        row = writeLabelValue(sheet, styles, row, "Zakres dat",
                filter.effectiveFrom().format(DATE_RANGE_FORMAT) + " - " + filter.effectiveTo().format(DATE_RANGE_FORMAT));

        List<WorkoutSessionGroup> sessions = WorkoutSessionGrouper.groupByWorkout(filteredSets);
        row = writeLabelValue(sheet, styles, row, "Liczba treningów", String.valueOf(sessions.size()));

        BigDecimal totalVolume = SessionMetrics.displayVolumeKg(MetricsConversion.toMetricsSets(filteredSets));
        row = writeLabelValue(sheet, styles, row, "Łączna objętość (kg)", totalVolume.toPlainString());

        if (!bodyWeights.isEmpty()) {
            BigDecimal start = bodyWeights.get(0).getWeightKg();
            BigDecimal end = bodyWeights.get(bodyWeights.size() - 1).getWeightKg();
            row = writeLabelValue(sheet, styles, row, "Waga na start (kg)", start.toPlainString());
            row = writeLabelValue(sheet, styles, row, "Waga na koniec (kg)", end.toPlainString());
            row = writeLabelValue(sheet, styles, row, "Zmiana wagi (kg)", end.subtract(start).toPlainString());
        }

        row++;
        Row prHeader = sheet.createRow(row++);
        prHeader.createCell(0).setCellValue("PR w tym okresie");
        prHeader.getCell(0).setCellStyle(styles.header());

        String[] prColumns = {"Data", "Ćwiczenie", "Kategoria", "Ciężar (kg)", "Powtórzenia"};
        Row prColumnsRow = sheet.createRow(row++);
        for (int i = 0; i < prColumns.length; i++) {
            prColumnsRow.createCell(i).setCellValue(prColumns[i]);
        }

        for (WorkoutSet s : filteredSets) {
            List<String> categories = prCategoriesBySetId.get(s.getId());
            if (categories == null) {
                continue;
            }
            Row prRow = sheet.createRow(row++);
            setDateCell(prRow, 0, styles, toWarsawDate(s.getCompletedAt()));
            prRow.createCell(1).setCellValue(s.getWorkoutExercise().getExercise().getName());
            prRow.createCell(2).setCellValue(String.join(" + ", categories));
            setWeightCell(prRow, 3, styles, s.getWeightKg());
            prRow.createCell(4).setCellValue(s.getReps());
        }

        ExcelStyles.autoSizeColumns(sheet, 5);

        writeWeeklyVolumeChart(sheet, styles, filteredSets, row + 2);
    }

    /**
     * Jedyny wykres unikalny dla arkusza Podsumowanie (Progres ćwiczeń i Waga
     * tygodniowo mają własne, oparte o dane już zapisane na TYCH arkuszach --
     * duplikowanie tego samego wykresu na Podsumowaniu nie miałoby sensu).
     * Mała tabela tydzień->objętość zapisywana lokalnie na tym arkuszu, żeby
     * wykres mógł się odwołać do zakresu komórek na tej samej karcie.
     */
    private void writeWeeklyVolumeChart(XSSFSheet sheet, ExcelStyles styles, List<WorkoutSet> filteredSets, int startRow) {
        Map<IsoWeek, BigDecimal> volumeByWeek = new TreeMap<>();
        for (WorkoutSet s : filteredSets) {
            if (s.isWarmup()) {
                continue;
            }
            IsoWeek week = IsoWeek.ofInstant(s.getWorkoutExercise().getWorkout().getStartedAt());
            BigDecimal volume = s.getWeightKg().multiply(BigDecimal.valueOf(s.getReps()));
            volumeByWeek.merge(week, volume, BigDecimal::add);
        }
        if (volumeByWeek.isEmpty()) {
            return;
        }

        Row header = sheet.createRow(startRow);
        header.createCell(0).setCellValue("Tydzień");
        header.createCell(1).setCellValue("Objętość (kg)");
        header.getCell(0).setCellStyle(styles.header());
        header.getCell(1).setCellStyle(styles.header());

        int rowIndex = startRow + 1;
        for (Map.Entry<IsoWeek, BigDecimal> entry : volumeByWeek.entrySet()) {
            Row row = sheet.createRow(rowIndex);
            row.createCell(0).setCellValue(entry.getKey().year() + "-W" + entry.getKey().week());
            setWeightCell(row, 1, styles, entry.getValue());
            rowIndex++;
        }

        ExcelCharts.addBarChart(sheet, rowIndex + 2, 0, "Objętość tygodniowa", "Objętość (kg)",
                0, 1, startRow + 1, rowIndex - 1);
    }

    private int writeLabelValue(XSSFSheet sheet, ExcelStyles styles, int rowIndex, String label, String value) {
        Row row = sheet.createRow(rowIndex);
        Cell labelCell = row.createCell(0);
        labelCell.setCellValue(label);
        labelCell.setCellStyle(styles.header());
        row.createCell(1).setCellValue(value);
        return rowIndex + 1;
    }

    // --- PR w całej historii (niezależnie od filtra eksportu) --------------

    private Map<UUID, List<String>> computeAllTimePrCategories(UUID userId, OneRepMaxFormula formula) {
        List<WorkoutSet> allSets = workoutSetRepository.findAllForUser(userId);

        Map<UUID, List<WorkoutSet>> byExercise = new LinkedHashMap<>();
        for (WorkoutSet s : allSets) {
            byExercise.computeIfAbsent(s.getWorkoutExercise().getExercise().getId(), id -> new ArrayList<>()).add(s);
        }

        Map<UUID, List<String>> result = new LinkedHashMap<>();
        for (List<WorkoutSet> exerciseSets : byExercise.values()) {
            List<WorkoutSessionGroup> sessions = WorkoutSessionGrouper.groupByWorkout(exerciseSets);
            for (int i = 0; i < sessions.size(); i++) {
                List<PersonalRecordCalculator.Session> prefix = sessions.subList(0, i + 1).stream()
                        .map(s -> new PersonalRecordCalculator.Session(s.workoutId(), MetricsConversion.toMetricsSets(s.rawSets())))
                        .toList();
                PersonalRecords broken = PersonalRecordCalculator.brokenIn(prefix, formula);
                broken.maxWeight().ifPresent(e -> result.computeIfAbsent(e.setId(), k -> new ArrayList<>()).add("Ciężar"));
                broken.maxE1rm().ifPresent(e -> result.computeIfAbsent(e.setId(), k -> new ArrayList<>()).add("e1RM"));
            }
        }
        return result;
    }

    // --- Pomocnicze ------------------------------------------------------

    private static LocalDate toWarsawDate(Instant instant) {
        return instant.atZone(IsoWeek.WARSAW).toLocalDate();
    }

    private static String polishDayName(LocalDate date) {
        DayOfWeek day = date.getDayOfWeek();
        String name = day.getDisplayName(TextStyle.FULL, POLISH);
        return name.substring(0, 1).toUpperCase(POLISH) + name.substring(1);
    }

    private static void setDateCell(Row row, int column, ExcelStyles styles, LocalDate date) {
        Cell cell = row.createCell(column);
        cell.setCellValue(date);
        cell.setCellStyle(styles.date());
    }

    private static void setWeightCell(Row row, int column, ExcelStyles styles, BigDecimal value) {
        Cell cell = row.createCell(column);
        cell.setCellValue(value.doubleValue());
        cell.setCellStyle(styles.weight());
    }

    private static void addNamedRange(XSSFSheet sheet, String name, int columnCount, int lastRow) {
        if (lastRow < 1) {
            return;
        }
        var namedRange = sheet.getWorkbook().createName();
        namedRange.setNameName(name);
        CellRangeAddress range = new CellRangeAddress(0, lastRow, 0, columnCount - 1);
        // formatAsString(sheetName, true) już dokleja prefiks arkusza ('Serie'!...) --
        // dodanie go jeszcze raz dawało "'Serie'!Serie!..." i FormulaParseException.
        namedRange.setRefersToFormula(range.formatAsString(sheet.getSheetName(), true));
    }

}

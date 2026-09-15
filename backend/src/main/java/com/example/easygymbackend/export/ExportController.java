package com.example.easygymbackend.export;

import com.example.easygymbackend.metrics.OneRepMaxFormula;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/export")
public class ExportController {

    private static final MediaType XLSX_MEDIA_TYPE =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final XlsxExportService xlsxExportService;

    public ExportController(XlsxExportService xlsxExportService) {
        this.xlsxExportService = xlsxExportService;
    }

    /** Sekcja 7 promptu: filtr = zakres dat, wybrane ćwiczenia, tylko serie robocze. */
    @GetMapping("/xlsx")
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) List<UUID> exerciseIds,
            @RequestParam(defaultValue = "false") boolean workingSetsOnly,
            @RequestParam(defaultValue = "EPLEY") OneRepMaxFormula formula
    ) {
        byte[] bytes = xlsxExportService.export(new ExportFilter(from, to, exerciseIds, workingSetsOnly), formula);

        return ResponseEntity.ok()
                .contentType(XLSX_MEDIA_TYPE)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"easy-gym-export.xlsx\"")
                .body(bytes);
    }

}

package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.dashboard.dto.DashboardResponse;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    /** from domyślnie 12 tygodni wstecz -- front i tak przełącza zakres (1M/3M/6M/1R/całość, sekcja 6). */
    @GetMapping
    public DashboardResponse getDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(defaultValue = "EPLEY") OneRepMaxFormula formula
    ) {
        LocalDate effectiveFrom = from != null ? from : LocalDate.now().minusWeeks(12);
        return dashboardService.getDashboard(effectiveFrom, formula);
    }

}

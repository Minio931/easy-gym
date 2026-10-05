package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.dashboard.dto.DashboardResponse;
import com.example.easygymbackend.metrics.IsoWeek;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private static final int DEFAULT_WEEKS = 12;
    private static final int MAX_WEEKS = 520;

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    /**
     * Default range: the last 12 full ISO weeks + the current one, counted from
     * Monday in Europe/Warsaw -- so that chart bars start exactly on the week
     * boundary, not "12 × 7 days back from now".
     */
    @GetMapping
    public DashboardResponse dashboard(
            @RequestParam(required = false) Integer weeks,
            @RequestParam(defaultValue = "false") boolean includeDeload
    ) {
        int range = Math.clamp(weeks != null ? weeks : DEFAULT_WEEKS, 1, MAX_WEEKS);
        LocalDate today = LocalDate.now(IsoWeek.WARSAW);
        LocalDate fromDate = IsoWeek.of(today).mondayStart().minusWeeks(range - 1L);

        Instant from = fromDate.atStartOfDay(IsoWeek.WARSAW).toInstant();
        Instant to = today.plusDays(1).atStartOfDay(IsoWeek.WARSAW).toInstant();

        return dashboardService.build(CurrentUser.id(), from, to, includeDeload);
    }

}

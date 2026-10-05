package com.example.easygymbackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class AppConfig {

    /**
     * Injected clock instead of Instant.now() scattered across services --
     * this way tests (e.g. expiry and LWW in sync) can control time without
     * sleeping the thread.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

}

package com.example.easygymbackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class AppConfig {

    /**
     * Wstrzykiwany zegar zamiast Instant.now() rozsianego po serwisach --
     * dzięki temu testy (np. wygasanie i LWW w sync) mogą sterować czasem
     * bez usypiania wątku.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

}

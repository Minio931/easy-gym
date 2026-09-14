package com.example.easygymbackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class EasyGymBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(EasyGymBackendApplication.class, args);
    }

}

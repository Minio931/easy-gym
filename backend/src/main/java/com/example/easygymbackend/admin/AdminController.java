package com.example.easygymbackend.admin;

import com.example.easygymbackend.admin.dto.CreateUserRequest;
import com.example.easygymbackend.admin.dto.CreateUserResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminUserService adminUserService;

    public AdminController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @PostMapping("/users")
    public ResponseEntity<CreateUserResponse> createUser(
            @RequestHeader(value = "X-Bootstrap-Secret", required = false) String bootstrapSecret,
            @Valid @RequestBody CreateUserRequest request
    ) {
        CreateUserResponse response = adminUserService.createUser(
                bootstrapSecret, request.login(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

}

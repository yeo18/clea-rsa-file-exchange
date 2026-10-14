package fr.univ.rsafileexchange.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void keepsHealthAndCsrfPublicButRequiresAuthenticationForAccountData() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/auth/session"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void allowsAnonymousRequestsForFrontendDocumentsAndAssets() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/assets/app.js"))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsStateChangingRequestsWithoutCsrf() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType("application/json")
                        .content("{\"email\":\"student@example.com\",\"password\":\"long enough password\"}"))
                .andExpect(status().isForbidden());
    }
}

package fr.univ.rsafileexchange.account;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.mock.web.MockHttpSession;

@SpringBootTest
@AutoConfigureMockMvc
class AuthenticationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private JavaMailSender mailSender;

    @BeforeEach
    void resetMail() {
        reset(mailSender);
    }

    @Test
    void verifiedEmailCreatesSessionAndTokenCannotBeReused() throws Exception {
        CsrfSession csrf = createCsrfSession();
        String email = "verify-" + java.util.UUID.randomUUID() + "@example.com";
        register(csrf, email);
        String token = verificationToken();

        mockMvc.perform(post("/api/auth/login")
                        .session(csrf.session())
                        .header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(email, "a sufficiently long password")))
                .andExpect(status().isUnauthorized());

        MvcResult verified = mockMvc.perform(post("/api/auth/verify")
                        .session(csrf.session())
                        .header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonToken(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andReturn();

        MockHttpSession authenticatedSession =
                (MockHttpSession) verified.getRequest().getSession(false);
        mockMvc.perform(get("/api/auth/session").session(authenticatedSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));

        mockMvc.perform(post("/api/auth/verify")
                        .session(authenticatedSession)
                        .header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonToken(token)))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/auth/logout")
                        .session(authenticatedSession)
                        .header("X-CSRF-TOKEN", csrf.token()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/auth/session").session(authenticatedSession))
                .andExpect(status().isUnauthorized());

        assertNullVerificationFields(email);
    }

    @Test
    void rejectsExpiredVerificationToken() throws Exception {
        CsrfSession csrf = createCsrfSession();
        String email = "expired-" + java.util.UUID.randomUUID() + "@example.com";
        register(csrf, email);
        String token = verificationToken();
        jdbcTemplate.update(
                "UPDATE accounts SET verification_expires_at = ? WHERE email_normalized = ?",
                Timestamp.from(Instant.now().minusSeconds(1)),
                email);

        mockMvc.perform(post("/api/auth/verify")
                        .session(csrf.session())
                        .header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonToken(token)))
                .andExpect(status().isBadRequest());
    }

    private CsrfSession createCsrfSession() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return new CsrfSession(body.get("token").asText(),
                (MockHttpSession) result.getRequest().getSession(false));
    }

    private void register(CsrfSession csrf, String email) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .session(csrf.session())
                        .header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(email, "a sufficiently long password")))
                .andExpect(status().isAccepted());
    }

    private String verificationToken() throws Exception {
        var message = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        Matcher matcher = Pattern.compile("#verify=([A-Za-z0-9_-]+)")
                .matcher(message.getValue().getText());
        if (!matcher.find()) {
            throw new AssertionError("Verification link did not contain a URL-fragment token");
        }
        return matcher.group(1);
    }

    private void assertNullVerificationFields(String email) {
        var row = jdbcTemplate.queryForMap(
                "SELECT verification_token_hash, verification_expires_at, verified_at "
                        + "FROM accounts WHERE email_normalized = ?",
                email);
        org.junit.jupiter.api.Assertions.assertNull(row.get("verification_token_hash"));
        org.junit.jupiter.api.Assertions.assertNull(row.get("verification_expires_at"));
        org.junit.jupiter.api.Assertions.assertNotNull(row.get("verified_at"));
    }

    private String json(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    private String jsonToken(String token) {
        return "{\"token\":\"" + token + "\"}";
    }

    private record CsrfSession(String token, MockHttpSession session) {
    }
}

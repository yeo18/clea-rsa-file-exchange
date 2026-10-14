package fr.univ.rsafileexchange.account;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
class ContactControllerTest {

    private static String publicKeyPem;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AccountService accountService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private JavaMailSender mailSender;

    @BeforeAll
    static void createValidPublicKey() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(3072);
        KeyPair keyPair = generator.generateKeyPair();
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII))
                .encodeToString(keyPair.getPublic().getEncoded());
        publicKeyPem = "-----BEGIN PUBLIC KEY-----\n" + base64 + "\n-----END PUBLIC KEY-----\n";
    }

    @Test
    void savesOnlySupportedPublicKeysAndFindsVerifiedRecipients() throws Exception {
        String ownerEmail = "owner-" + UUID.randomUUID() + "@example.com";
        String recipientEmail = "recipient-" + UUID.randomUUID() + "@example.com";
        accountService.register(ownerEmail, "a sufficiently long password");
        accountService.register(recipientEmail, "another long password");
        jdbcTemplate.update(
                "UPDATE accounts SET verified_at = CURRENT_TIMESTAMP, "
                        + "verification_token_hash = NULL, verification_expires_at = NULL "
                        + "WHERE email_normalized IN (?, ?)",
                ownerEmail,
                recipientEmail);

        AuthSession session = login(ownerEmail, "a sufficiently long password");
        mockMvc.perform(put("/api/account/public-key")
                        .session(session.session())
                        .header("X-CSRF-TOKEN", session.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonPublicKey(publicKeyPem)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/contacts")
                        .session(session.session())
                        .param("email", recipientEmail))
                .andExpect(status().isNotFound());

        AuthSession recipientSession = login(recipientEmail, "another long password");
        mockMvc.perform(put("/api/account/public-key")
                        .session(recipientSession.session())
                        .header("X-CSRF-TOKEN", recipientSession.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonPublicKey(publicKeyPem)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/contacts")
                        .session(session.session())
                        .param("email", recipientEmail))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.email").value(recipientEmail))
                .andExpect(jsonPath("$.publicKeyPem").value(publicKeyPem))
                .andExpect(jsonPath("$.online").value(false));
    }

    @Test
    void rejectsInvalidOrUnsupportedRsaPublicKeys() throws Exception {
        String email = "invalid-key-" + UUID.randomUUID() + "@example.com";
        accountService.register(email, "a sufficiently long password");
        jdbcTemplate.update(
                "UPDATE accounts SET verified_at = CURRENT_TIMESTAMP, "
                        + "verification_token_hash = NULL, verification_expires_at = NULL "
                        + "WHERE email_normalized = ?",
                email);
        AuthSession session = login(email, "a sufficiently long password");

        mockMvc.perform(put("/api/account/public-key")
                        .session(session.session())
                        .header("X-CSRF-TOKEN", session.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonPublicKey("not a public key")))
                .andExpect(status().isBadRequest());

        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair shortKeyPair = generator.generateKeyPair();
        String shortKey = "-----BEGIN PUBLIC KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII))
                        .encodeToString(shortKeyPair.getPublic().getEncoded())
                + "\n-----END PUBLIC KEY-----\n";
        mockMvc.perform(put("/api/account/public-key")
                        .session(session.session())
                        .header("X-CSRF-TOKEN", session.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonPublicKey(shortKey)))
                .andExpect(status().isBadRequest());
    }

    private AuthSession login(String email, String password) throws Exception {
        MvcResult csrfResult = mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode csrfJson = objectMapper.readTree(csrfResult.getResponse().getContentAsString());
        String csrfToken = csrfJson.get("token").asText();
        MockHttpSession session = (MockHttpSession) csrfResult.getRequest().getSession(false);

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .header("X-CSRF-TOKEN", csrfToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return new AuthSession(csrfToken, (MockHttpSession) loginResult.getRequest().getSession(false));
    }

    private String jsonPublicKey(String key) throws Exception {
        return "{\"publicKeyPem\":" + objectMapper.writeValueAsString(key) + "}";
    }

    private record AuthSession(String csrfToken, MockHttpSession session) {
    }
}

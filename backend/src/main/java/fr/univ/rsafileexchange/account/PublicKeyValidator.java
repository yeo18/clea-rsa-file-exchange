package fr.univ.rsafileexchange.account;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import org.springframework.stereotype.Component;

@Component
public class PublicKeyValidator {

    private static final String PEM_HEADER = "-----BEGIN PUBLIC KEY-----";
    private static final String PEM_FOOTER = "-----END PUBLIC KEY-----";
    private static final int REQUIRED_MODULUS_BITS = 3072;
    private static final java.math.BigInteger REQUIRED_PUBLIC_EXPONENT =
            java.math.BigInteger.valueOf(65537);

    public void validate(String pem) {
        if (pem == null || pem.length() > 4096) {
            throw new InvalidPublicKeyException();
        }

        String normalizedPem = pem.trim();
        if (!normalizedPem.startsWith(PEM_HEADER) || !normalizedPem.endsWith(PEM_FOOTER)) {
            throw new InvalidPublicKeyException();
        }
        String encoded = normalizedPem.substring(
                        PEM_HEADER.length(),
                        normalizedPem.length() - PEM_FOOTER.length())
                .replaceAll("\\s", "");
        try {
            byte[] der = Base64.getDecoder().decode(encoded);
            RSAPublicKey publicKey = (RSAPublicKey) KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(der));
            if (publicKey.getModulus().bitLength() != REQUIRED_MODULUS_BITS
                    || !publicKey.getPublicExponent().equals(REQUIRED_PUBLIC_EXPONENT)) {
                throw new InvalidPublicKeyException();
            }
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw new InvalidPublicKeyException();
        }
    }
}

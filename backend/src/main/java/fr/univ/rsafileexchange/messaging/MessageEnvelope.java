package fr.univ.rsafileexchange.messaging;

public record MessageEnvelope(
        int version,
        KeyEncryption keyEncryption,
        ContentEncryption contentEncryption,
        String ciphertext) {

    public record KeyEncryption(String name, String hash, String wrappedKey) {
    }

    public record ContentEncryption(String name, int length, String iv, int tagLength) {
    }
}

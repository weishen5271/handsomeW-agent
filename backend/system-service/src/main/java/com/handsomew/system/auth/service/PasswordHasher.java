package com.handsomew.system.auth.service;

import org.springframework.stereotype.Component;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.SecureRandom;

@Component
public class PasswordHasher {

    private static final int PBKDF2_ROUNDS = 120_000;
    private static final int KEY_LENGTH = 256;
    private final SecureRandom secureRandom = new SecureRandom();

    public String generateSaltHex() {
        byte[] bytes = new byte[16];
        secureRandom.nextBytes(bytes);
        return bytesToHex(bytes);
    }

    public String hashPassword(String password, String saltHex) {
        try {
            byte[] saltBytes = hexToBytes(saltHex);
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), saltBytes, PBKDF2_ROUNDS, KEY_LENGTH);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return bytesToHex(factory.generateSecret(spec).getEncoded());
        } catch (Exception ex) {
            throw new IllegalStateException("密码加密失败", ex);
        }
    }

    private static byte[] hexToBytes(String hex) {
        int length = hex.length();
        byte[] data = new byte[length / 2];
        for (int i = 0; i < length; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}

package com.handsomew.system.auth.service;

import com.handsomew.system.auth.model.AuthUser;
import com.handsomew.system.auth.model.UserPublic;
import com.handsomew.system.auth.model.UserRole;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AuthRepository {

    private final JdbcTemplate jdbcTemplate;

    public AuthRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public int countUsers() {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        return count == null ? 0 : count;
    }

    public Optional<UserRecord> findUserByUsername(String username) {
        List<UserRecord> result = jdbcTemplate.query(
                "SELECT id, username, password_hash, salt, role, created_at FROM users WHERE username = ?",
                userRecordRowMapper(),
                username
        );
        return result.stream().findFirst();
    }

    public Optional<UserPublic> findUserByToken(String token) {
        List<UserPublic> result = jdbcTemplate.query(
                """
                SELECT u.id, u.username, u.role, u.created_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > NOW()
                """,
                userPublicRowMapper(),
                token
        );
        return result.stream().findFirst();
    }

    public UserPublic createUser(String username, String passwordHash, String salt, UserRole role) {
        return jdbcTemplate.queryForObject(
                """
                INSERT INTO users(username, password_hash, salt, role, created_at)
                VALUES (?, ?, ?, ?, NOW())
                RETURNING id, username, role, created_at
                """,
                userPublicRowMapper(),
                username, passwordHash, salt, role.name()
        );
    }

    public String createSession(long userId) {
        String token = java.util.UUID.randomUUID().toString().replace("-", "") + java.util.UUID.randomUUID().toString().replace("-", "");
        jdbcTemplate.update(
                """
                INSERT INTO sessions(token, user_id, created_at, expires_at)
                VALUES (?, ?, NOW(), NOW() + INTERVAL '7 days')
                """,
                token, userId
        );
        return token;
    }

    public void revokeSession(String token) {
        jdbcTemplate.update("DELETE FROM sessions WHERE token = ?", token);
    }

    public List<UserPublic> listUsers(int page, int pageSize) {
        int offset = Math.max(0, (page - 1) * pageSize);
        return jdbcTemplate.query(
                """
                SELECT id, username, role, created_at
                FROM users
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                userPublicRowMapper(),
                pageSize, offset
        );
    }

    public int countUserList() {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        return count == null ? 0 : count;
    }

    public Optional<UserPublic> updateUser(long userId, String username, String passwordHash, String salt, UserRole role) {
        List<Map<String, Object>> current = jdbcTemplate.queryForList("SELECT * FROM users WHERE id = ?", userId);
        if (current.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> record = current.get(0);
        String nextUsername = username != null ? username : String.valueOf(record.get("username"));
        String nextPasswordHash = passwordHash != null ? passwordHash : String.valueOf(record.get("password_hash"));
        String nextSalt = salt != null ? salt : String.valueOf(record.get("salt"));
        String nextRole = role != null ? role.name() : String.valueOf(record.get("role"));
        List<UserPublic> result = jdbcTemplate.query(
                """
                UPDATE users
                SET username = ?, password_hash = ?, salt = ?, role = ?
                WHERE id = ?
                RETURNING id, username, role, created_at
                """,
                userPublicRowMapper(),
                nextUsername, nextPasswordHash, nextSalt, nextRole, userId
        );
        return result.stream().findFirst();
    }

    public boolean deleteUser(long userId) {
        return jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId) > 0;
    }

    public void cleanupExpiredSessions() {
        jdbcTemplate.update("DELETE FROM sessions WHERE expires_at <= NOW()");
    }

    private RowMapper<UserPublic> userPublicRowMapper() {
        return (rs, rowNum) -> new UserPublic(
                rs.getLong("id"),
                rs.getString("username"),
                UserRole.valueOf(rs.getString("role")),
                rs.getObject("created_at", OffsetDateTime.class)
        );
    }

    private RowMapper<UserRecord> userRecordRowMapper() {
        return (rs, rowNum) -> new UserRecord(
                rs.getLong("id"),
                rs.getString("username"),
                rs.getString("password_hash"),
                rs.getString("salt"),
                UserRole.valueOf(rs.getString("role")),
                rs.getObject("created_at", OffsetDateTime.class)
        );
    }

    public record UserRecord(
            long id,
            String username,
            String passwordHash,
            String salt,
            UserRole role,
            OffsetDateTime createdAt
    ) {
    }
}

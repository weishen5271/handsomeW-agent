import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import PaginationControls from "../components/PaginationControls";
import type { AuthUser, UserRole } from "../types/app";

type UsersViewProps = {
  currentUser: AuthUser;
  users: AuthUser[];
  usersLoading: boolean;
  usersError: string;
  usersPage: number;
  usersPageSize: number;
  usersTotal: number;
  onClearError: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onCreateUser: (payload: { username: string; password: string; role: UserRole }) => void | Promise<void>;
  onSaveUser: (payload: { id: number; username: string; password: string; role: UserRole }) => void | Promise<void>;
  onRemoveUser: (userId: number) => void | Promise<void>;
};

export default function UsersView({
  currentUser,
  users,
  usersLoading,
  usersError,
  usersPage,
  usersPageSize,
  usersTotal,
  onClearError,
  onPageChange,
  onPageSizeChange,
  onCreateUser,
  onSaveUser,
  onRemoveUser,
}: UsersViewProps) {
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("user");

  const openEditModal = (user: AuthUser) => {
    setEditingUserId(user.id);
    setEditUsername(user.username);
    setEditPassword("");
    setEditRole(user.role);
    setEditUserModalOpen(true);
    onClearError();
  };

  return (
    <section className="flex-1 overflow-y-auto bg-[var(--color-surface-raised)] p-6">
      <div className="card rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-end gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onClearError();
              setCreateUserModalOpen(true);
            }}
          >
            <UserPlus size={14} /> 新增用户
          </button>
        </div>
        {usersError && <p className="mb-3 text-sm text-red-500">{usersError}</p>}
        {usersLoading ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[rgba(27,97,201,0.1)] px-3 py-2 text-[var(--color-text-weak)]">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span>加载中...</span>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[var(--color-surface-raised)]">
                  <th className="table-header">用户名</th>
                  <th className="table-header">角色</th>
                  <th className="table-header">创建时间</th>
                  <th className="table-header">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {users.map((user) => {
                  const isSelf = currentUser.id === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-[var(--color-surface-raised)]">
                      <td className="table-cell text-sm text-[var(--color-text)]">{user.username}</td>
                      <td className="table-cell text-sm text-[var(--color-text-weak)]">{user.role}</td>
                      <td className="table-cell text-sm text-[var(--color-text-weak)]">{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="table-cell">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="btn-secondary rounded-md px-2 py-1 text-xs"
                            onClick={() => openEditModal(user)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btn-danger rounded-md px-2 py-1 text-xs"
                            onClick={() => void onRemoveUser(user.id)}
                            disabled={isSelf}
                          >
                            <Trash2 size={12} /> 删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls
          page={usersPage}
          pageSize={usersPageSize}
          total={usersTotal}
          onPageChange={onPageChange}
          onPageSizeChange={(size) => {
            onPageSizeChange(size);
            onPageChange(1);
          }}
        />
      </div>

      {createUserModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4">
          <div className="card w-full max-w-md p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[var(--color-text)]">新增用户</h3>
              <button
                type="button"
                className="btn-secondary inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setCreateUserModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="用户名"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <input
                type="password"
                className="input"
                placeholder="初始密码"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <select
                className="input"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCreateUserModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void onCreateUser({ username: newUsername, password: newPassword, role: newRole });
                  setNewUsername("");
                  setNewPassword("");
                  setNewRole("user");
                  setCreateUserModalOpen(false);
                }}
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {editUserModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4">
          <div className="card w-full max-w-md p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[var(--color-text)]">编辑用户</h3>
              <button
                type="button"
                className="btn-secondary inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setEditUserModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="用户名"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
              <input
                type="password"
                className="input"
                placeholder="留空表示不修改密码"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
              <select
                className="input"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditUserModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={editingUserId === null}
                onClick={() => {
                  if (editingUserId === null) return;
                  void onSaveUser({
                    id: editingUserId,
                    username: editUsername,
                    password: editPassword,
                    role: editRole,
                  });
                  setEditUserModalOpen(false);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

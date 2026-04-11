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
    <section className="flex-1 overflow-y-auto bg-slate-50/30 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-end gap-3">
          <button
            type="button"
            className="btn-top-primary"
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
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-blue-50 px-3 py-2 text-slate-600">
            <Loader2 size={14} className="animate-spin text-blue-600" />
            <span>加载中...</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50">
                  <th className="table-th">用户名</th>
                  <th className="table-th">角色</th>
                  <th className="table-th">创建时间</th>
                  <th className="table-th">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const isSelf = currentUser.id === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60">
                      <td className="table-td text-sm text-slate-700">{user.username}</td>
                      <td className="table-td text-sm text-slate-500">{user.role}</td>
                      <td className="table-td text-sm text-slate-500">{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="table-td">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-2 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                            onClick={() => openEditModal(user)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-title text-lg font-bold text-slate-800">新增用户</h3>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setCreateUserModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="用户名"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <input
                type="password"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="初始密码"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <select
                className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-50"
                onClick={() => setCreateUserModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm text-white transition hover:bg-blue-700"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-title text-lg font-bold text-slate-800">编辑用户</h3>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setEditUserModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="用户名"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
              <input
                type="password"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="留空表示不修改密码"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
              <select
                className="h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition hover:bg-slate-50"
                onClick={() => setEditUserModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm text-white transition hover:bg-blue-700"
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

import { useEffect, useRef, useState } from 'react';
import { ApiError, type ApiClient } from '@aptly/api-client';
import type {
  AdminAssignment,
  AdminUser,
  CreateAssignmentInput,
  EnrollmentPlatform,
  EnrollmentInvitation,
} from '@aptly/contracts';

export function useWorkspace(api: ApiClient, onExpired: () => void) {
  const [rows, setRows] = useState<AdminAssignment[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [moreUsers, setMoreUsers] = useState(false);
  const [detail, setDetail] = useState<AdminAssignment | null>(null);
  const [invitation, setInvitation] = useState<EnrollmentInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(false);
  const actionLock = useRef(false);
  const actionVersion = useRef(0);
  const readVersion = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const expired = useRef(onExpired);
  expired.current = onExpired;
  const report = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) expired.current();
    else if (!(failure instanceof ApiError && failure.code === 'CANCELLED'))
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Something went wrong. Refresh and try again.',
      );
  };
  async function action(work: (signal: AbortSignal) => Promise<void>): Promise<boolean> {
    if (actionLock.current) return false;
    const ownAction = ++actionVersion.current;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      await work(controller.signal);
      return alive.current && ownAction === actionVersion.current && !controller.signal.aborted;
    } catch (failure) {
      if (alive.current) report(failure);
      return false;
    } finally {
      controllers.current.delete(controller);
      if (ownAction === actionVersion.current) {
        actionLock.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function load(nextPage = page, selectedId: string | null = detail?.id ?? null) {
    const version = ++readVersion.current;
    await action(async (signal) => {
      const [assignments, people] = await Promise.all([
        api.adminAssignments(nextPage, { signal }),
        api.adminUsers(1, { signal }),
      ]);
      const nextDetail = selectedId
        ? await api.adminAssignment(selectedId, { signal })
        : (assignments.assignments[0] ?? null);
      if (!alive.current || version !== readVersion.current) return;
      setRows(assignments.assignments);
      setPage(nextPage);
      setHasMore(assignments.hasMore);
      setUsers(people.users);
      setMoreUsers(people.hasMore);
      setUserPage(1);
      setDetail(nextDetail);
      setInvitation((current) =>
        current &&
        nextDetail?.latestInvitation &&
        current.id === nextDetail.latestInvitation.id &&
        !nextDetail.latestInvitation.usedAt &&
        !nextDetail.latestInvitation.revokedAt
          ? current
          : null,
      );
    });
  }
  useEffect(() => {
    alive.current = true;
    void load(1, null);
    return () => {
      alive.current = false;
      readVersion.current++;
      actionVersion.current++;
      actionLock.current = false;
      for (const controller of controllers.current) controller.abort();
    };
    // A new credential creates a new component/API instance; no cross-account state is retained.
  }, [api]);
  return {
    rows,
    users,
    page,
    hasMore,
    moreUsers,
    detail,
    invitation,
    busy,
    error,
    notice,
    refresh: () => load(),
    changePage: (value: number) => {
      setDetail(null);
      setInvitation(null);
      return load(value, null);
    },
    select: (id: string) => {
      // The current QR belongs to this selection. Re-selecting it must not discard it.
      if (detail?.id === id) return Promise.resolve(true);
      return action(async (signal) => {
        const result = await api.adminAssignment(id, { signal });
        if (!alive.current) return;
        setDetail(result);
        setInvitation(null);
      });
    },
    morePeople: () =>
      action(async (signal) => {
        const result = await api.adminUsers(userPage + 1, { signal });
        if (!alive.current) return;
        setUsers((current) => [...current, ...result.users]);
        setUserPage((current) => current + 1);
        setMoreUsers(result.hasMore);
      }),
    create: (input: CreateAssignmentInput) =>
      action(async (signal) => {
        const created = await api.createAssignment(input, { signal });
        const [result, list] = await Promise.all([
          api.adminAssignment(created.id, { signal }),
          api.adminAssignments(1, { signal }),
        ]);
        if (!alive.current) return;
        setDetail(result);
        setInvitation(null);
        setRows(list.assignments);
        setPage(1);
        setHasMore(list.hasMore);
        setNotice(
          'Recorder added. Sign in to the phone app with the assigned account to connect it. A QR invitation is optional.',
        );
      }),
    clearInvitation: () => setInvitation(null),
    issue: (platform: EnrollmentPlatform = 'android') =>
      action(async (signal) => {
        if (!detail) return;
        setInvitation(null);
        const issued = await api.issueInvitation(detail.id, 86400, { signal, platform });
        const updated = await api.adminAssignment(detail.id, { signal });
        if (!alive.current) return;
        setDetail(updated);
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        if (
          updated.latestInvitation?.id === issued.id &&
          !updated.latestInvitation.revokedAt &&
          !updated.latestInvitation.usedAt
        )
          setInvitation(issued);
        setNotice('Invitation created. It expires in 24 hours.');
      }),
    revoke: () =>
      action(async (signal) => {
        if (!detail?.latestInvitation) return;
        setInvitation(null);
        await api.revokeInvitation(detail.latestInvitation.id, { signal });
        if (!alive.current) return;
        setDetail(null);
        const updated = await api.adminAssignment(detail.id, { signal });
        if (!alive.current) return;
        setInvitation(null);
        setDetail(updated);
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        setNotice('Invitation revoked.');
      }),
    end: (status: 'released' | 'revoked') =>
      action(async (signal) => {
        if (!detail) return;
        setInvitation(null);
        await api.endAssignment(detail.id, status, { signal });
        if (!alive.current) return;
        setDetail(null);
        const updated = await api.adminAssignment(detail.id, { signal });
        if (!alive.current) return;
        setInvitation(null);
        setDetail(updated);
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        setNotice('Assignment ended. Its invitations and pending setup have been revoked.');
      }),
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;

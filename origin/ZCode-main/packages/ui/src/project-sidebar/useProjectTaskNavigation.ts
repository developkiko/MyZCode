import { useCallback, useLayoutEffect, useRef } from "react";
import type {
  ProjectSidebarProps,
  ProjectTree,
  IRemoteProjectService,
} from "@/project-sidebar/contract.js";
import { attachRemoteProjectWorkspace } from "@/project-sidebar/remote-navigation.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";
import { openWebRemoteControlTask } from "@/hooks/useWebRemoteControlTaskOpen.js";
import { logger } from "@/logger.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { isWorkspaceTab, isWorkspaceTabReadOnly, type TabStore } from "@/store/tabStore.js";
import { useTabStore, useTabStoreApi } from "@/store/TabStoreProvider.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useOptionalProjectDirectory } from "@/project-sidebar/ProjectDirectoryProvider.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { DesktopCommandIds, type TabId } from "@zcode/shared";

interface MissingWorkspacePrompts {
  requestConfirmation: (options: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<boolean>;
  formatMessage: (descriptor: { id: string }, values?: Record<string, string | number>) => string;
}

/**
 * Импортированный чат может ссылаться на папку, которой на этом ПК нет.
 * Открываем такой чат только после выбора реальной папки и перепривязки путей.
 * null — пользователь отказался; staleTabIds закрываются после навигации.
 */
async function resolveOpenableLocalWorkspace({
  path,
  identity,
  isCurrent,
  platform,
  prompts,
  refreshDirectory,
  tabStore,
}: {
  path: string;
  identity?: string;
  isCurrent: () => boolean;
  platform: ReturnType<typeof useOptionalPlatform>;
  prompts: MissingWorkspacePrompts;
  refreshDirectory?: () => Promise<void>;
  tabStore: TabStore;
}): Promise<{ path: string; staleTabIds: TabId[] } | null> {
  const unchanged = { path, staleTabIds: [] };
  if (identity?.trim() || !platform) return unchanged;
  const staleTabs = tabStore
    .getState()
    .tabs.filter(isWorkspaceTab)
    .filter((tab) => tab.workspacePath === path);
  if (staleTabs.length > 0 && !staleTabs.some(isWorkspaceTabReadOnly)) return unchanged;

  let available = true;
  try {
    const probe = (await platform.executeDesktopCommand(
      DesktopCommandIds.CheckLocalDirectory,
      { path },
    )) as { available?: boolean } | undefined;
    available = probe?.available !== false;
  } catch {
    // Проверка недоступна в этой среде — не мешаем открытию.
    return unchanged;
  }
  if (available) return unchanged;

  const confirmed = await prompts.requestConfirmation({
    title: prompts.formatMessage({ id: "workspaceMissingFolder.title" }),
    description: prompts.formatMessage({ id: "workspaceMissingFolder.description" }, { path }),
    confirmLabel: prompts.formatMessage({ id: "workspaceMissingFolder.selectFolder" }),
    cancelLabel: prompts.formatMessage({ id: "common.cancel" }),
  });
  if (!confirmed || !isCurrent()) return null;

  const selected = (await platform.selectDirectory())?.trim();
  if (!selected || !isCurrent()) return null;

  try {
    const result = (await platform.executeDesktopCommand(
      DesktopCommandIds.ImportFromOriginalZCode,
      { remapProjectPaths: [{ from: path, to: selected }] },
    )) as { errors?: string[] } | undefined;
    if (result?.errors?.length) {
      toast(prompts.formatMessage({ id: "workspaceMissingFolder.remapFailed" }));
      return null;
    }
  } catch {
    toast(prompts.formatMessage({ id: "workspaceMissingFolder.remapFailed" }));
    return null;
  }
  if (!isCurrent()) return null;

  await refreshDirectory?.();
  toast(prompts.formatMessage({ id: "workspaceMissingFolder.remapDone" }, { path: selected }));
  return { path: selected, staleTabIds: staleTabs.map((tab) => tab.id) };
}

/** 打开任务才绑定 workspace；列表 mutation 不借导航创建 scope。 */
export function useProjectTaskNavigation(
  props: ProjectSidebarProps,
  tree: ProjectTree,
  remoteService?: IRemoteProjectService,
): ProjectSidebarProps["onSelectTask"] {
  const activeWorkspaceIdentity = useTabStore((state) => state.activeWorkspaceIdentity);
  const tabStore = useTabStoreApi();
  const platform = useOptionalPlatform();
  const requestConfirmation = useConfirmDialog();
  const projectDirectory = useOptionalProjectDirectory();
  const { intl } = useZCodeIntl();
  const sequence = useRef(0);
  useLayoutEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const latest = useRef({
    props,
    tree,
    remoteService,
    activeWorkspaceIdentity,
    platform,
    requestConfirmation,
    refreshDirectory: projectDirectory?.refresh,
    formatMessage: intl.formatMessage.bind(intl),
    tabStore,
  });
  useLayoutEffect(() => {
    latest.current = {
      props,
      tree,
      remoteService,
      activeWorkspaceIdentity,
      platform,
      requestConfirmation,
      refreshDirectory: projectDirectory?.refresh,
      formatMessage: intl.formatMessage.bind(intl),
      tabStore,
    };
  });
  return useCallback((path, taskId, identity, remoteSessionId, unreadAt) => {
    const request = ++sequence.current;
    const {
      props,
      tree,
      remoteService,
      activeWorkspaceIdentity,
      platform,
      requestConfirmation,
      refreshDirectory,
      formatMessage,
      tabStore,
    } = latest.current;
    const readFocus = () =>
      props.workspacePath
        ? useZCodeSessionStore
            .getState()
            .getWorkspaceState(props.workspacePath, activeWorkspaceIdentity ?? undefined)
        : undefined;
    const originFocus = readFocus();
    // 同一目录内切换任务或新草稿也会使旧连接失效，不能仅比较 workspace 身份。
    const isCurrent = () =>
      sequence.current === request &&
      latest.current.activeWorkspaceIdentity === activeWorkspaceIdentity &&
      readFocus()?.activeTaskId === originFocus?.activeTaskId &&
      readFocus()?.draftFocusVersion === originFocus?.draftFocusVersion &&
      (!identity ||
        latest.current.tree.tasks.some(
          (task) => task.taskId === taskId && task.workspaceIdentity === identity,
        ));
    const open = async () => {
      const task = tree.tasks.find(
        (item) =>
          item.taskId === taskId &&
          (item.workspaceIdentity || item.workspacePath) === (identity || path),
      );
      if (props.webRemoteControlWorkspaceSwitcher) {
        if (!task) throw new Error("project.task-not-found");
        await openWebRemoteControlTask({
          switcher: props.webRemoteControlWorkspaceSwitcher,
          activeWorkspacePath: props.workspacePath,
          activeWorkspaceIdentity: activeWorkspaceIdentity ?? undefined,
          activeTaskId: null,
          task: {
            ...task,
            workspacePath: path,
            workspaceIdentity: identity,
            taskId,
            unreadAt,
            workspaceLabel: path,
            workspaceKind: task.hostId === "local" ? "local" : "remote",
          },
          markTaskReadOnOpen: true,
          mobileNavigationIntent: "chat",
          onSelectTask: props.onSelectTask,
          onTaskOpen: props.onWebRemoteTaskOpen,
          onSwitchingChange: props.onWebRemoteTaskSwitchingChange,
          setError: (error) => {
            if (error) toast(error);
          },
        });
        return;
      }
      if (identity && task && remoteService) {
        const directory = await remoteService.readDirectory();
        if (!isCurrent()) return;
        if (directory.hosts.some((host) => host.id === task.hostId)) {
          remoteSessionId = await attachRemoteProjectWorkspace({
            hostId: task.hostId,
            workspacePath: path,
            workspaceIdentity: identity,
            remoteService,
            isCurrent,
            findSession: (key) =>
              Object.values(useRemoteWorkspaceSessionStore.getState().sessionsById).find(
                (session) => session.workspaceIdentity === key,
              ),
            connect: props.onConnectRemote,
            bind: (sessionId, workspacePath, guard) =>
              props.onSelectRemoteProject(sessionId, workspacePath, undefined, identity, guard),
            cancel: props.onCancelRemoteProject,
          });
        }
      }
      const openable = await resolveOpenableLocalWorkspace({
        path,
        identity,
        isCurrent,
        platform,
        prompts: { requestConfirmation, formatMessage },
        refreshDirectory,
        tabStore,
      });
      if (openable === null || !isCurrent()) return;
      props.onSelectTask(openable.path, taskId, identity, remoteSessionId, unreadAt);
      // Старые вкладки на исчезнувшую папку закрываем только после навигации:
      // закрытие активной вкладки до неё сменило бы workspace и отменило открытие.
      for (const staleTabId of openable.staleTabIds) tabStore.getState().closeTab(staleTabId);
    };
    void open().catch((error) => {
      // Bug 原因：首连等待期间连点任务，被替代的旧点击会抛 navigation-cancelled，或与新点击共享
      // 同一连接失败，每次都弹错误。被替代是用户的新意图，结果只由最新导航提示。
      if (
        sequence.current !== request ||
        (error instanceof Error && error.message === "project.navigation-cancelled")
      )
        return;
      logger.error("[project-sidebar] 打开任务失败", error);
      toast(String(error));
    });
  }, []);
}

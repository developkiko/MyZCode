/* oxlint-disable eslint(max-lines) -- settings helper 聚合多个设置分组；终端、网络与自动归档多侧能力暂时超过行数限制。 */
import type {
  AppToolSearchMode,
  IntegratedTerminalShellOption,
  IntegratedTerminalShellSelection,
  LocalePreference,
  ZCodeInteractionBehavior,
} from "@zcode/shared";
import { appToolSearchModeSchema } from "@zcode/shared";
import {
  TID_SETTINGS_ASK_USER_QUESTION_AUTO_RESOLUTION_SWITCH,
  TID_SETTINGS_NATIVE_SEARCH_SWITCH,
  TID_SETTINGS_TOOL_SEARCH_SELECT,
  TID_SETTINGS_TOOL_SEARCH_OPTION,
} from "@zcode/shared/test-ids";
import { useState, useCallback, useEffect } from "react";
import { DesktopCommandIds } from "@zcode/shared";
import type { IPlatformService } from "@zcode/shared";
import {
  TID_SETTINGS_LOCALE_SELECT_ITEM,
  TID_SETTINGS_LOCALE_SELECT_TRIGGER,
  testId,
} from "@zcode/shared/test-ids";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Switch } from "@/components/ui/switch.js";
import { Input } from "@/components/ui/input.js";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { SettingsBadge, SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";
import { DataBaseDirControl } from "@/settings/DataBaseDirControl.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { ProactiveSuggestionsSetting } from "@/settings/ProactiveSuggestionsSetting.js";
import { DynamicWorkflowModeSetting } from "@/settings/DynamicWorkflowModeSetting.js";
import { normalizeInterfaceMode, type InterfaceMode } from "@/lib/interfaceMode.js";
import {
  createSettingsPageConfig,
  resolveSettingsSectionForPlatform,
  SETTINGS_SECTION_GROUPS,
  SETTINGS_SECTIONS,
  isSettingsSectionAvailable,
  type SettingsSectionId,
} from "@/settings/settingsPageConfig.js";

export type { Locale, LocalePreference } from "@zcode/shared";
export { type SettingsSectionId };
export { createSettingsPageConfig, resolveSettingsSectionForPlatform };
export { SETTINGS_SECTION_GROUPS, SETTINGS_SECTIONS };
export { isSettingsSectionAvailable };

const TASK_AUTO_ARCHIVE_DAY_OPTIONS = [3, 7, 14, 30] as const;
const ZCODE_INTERACTION_BEHAVIOR_OPTIONS: readonly ZCodeInteractionBehavior[] = ["queue", "guide"];

/**
 * 归档偏好与归档列表集中展示，设置值和保存动作继续由 SettingsPage 持有。
 * Bugfix：关闭时禁用时长会迫使用户先开启归档，旧阈值可能立即生效；允许先保存时长再开启。
 */
export function TaskAutoArchiveSettings({
  taskAutoArchiveEnabled,
  taskAutoArchiveOlderThanDays,
  onTaskAutoArchiveEnabledChange,
  onTaskAutoArchiveOlderThanDaysChange,
}: {
  taskAutoArchiveEnabled: boolean;
  taskAutoArchiveOlderThanDays: number;
  onTaskAutoArchiveEnabledChange: (enabled: boolean) => Promise<void>;
  onTaskAutoArchiveOlderThanDaysChange: (days: number) => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  return (
    <SettingsGroupCard>
      <SettingsRow
        controlLayout="wide"
        label={intl.formatMessage({ id: "settings.taskAutoArchive" })}
        description={intl.formatMessage({
          id: "settings.taskAutoArchiveDescription",
        })}
        control={
          <Switch
            data-testid="archive-auto-archive-switch"
            aria-label={intl.formatMessage({ id: "settings.taskAutoArchive" })}
            checked={taskAutoArchiveEnabled}
            onCheckedChange={(checked) => {
              void onTaskAutoArchiveEnabledChange(checked);
            }}
          />
        }
      />
      <SettingsRow
        controlLayout="wide"
        label={intl.formatMessage({ id: "settings.taskAutoArchiveDays" })}
        description={intl.formatMessage({
          id: "settings.taskAutoArchiveDaysDescription",
        })}
        control={
          <Select
            value={String(taskAutoArchiveOlderThanDays)}
            onValueChange={(value) => {
              void onTaskAutoArchiveOlderThanDaysChange(Number(value));
            }}
          >
            <SelectTrigger
              data-testid="archive-auto-archive-days"
              aria-label={intl.formatMessage({ id: "settings.taskAutoArchiveDays" })}
              size="lg"
              className="w-full min-w-0 justify-between"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_AUTO_ARCHIVE_DAY_OPTIONS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {intl.formatMessage({
                    id: `settings.taskAutoArchiveDays.option.${days}`,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsGroupCard>
  );
}

export function GeneralSectionContent({
  localePreference,
  interfaceMode = "coding",
  setInterfaceMode = () => {},
  notificationEnabled,
  notificationSoundEnabled,
  closeToTrayOnWindows,
  keepAwakeWhileRunning = false,
  desktopChromiumHardwareAccelerationEnabled = true,
  receivePreviewUpdates,
  autoDownloadAndInstallUpdates,
  dataBaseDir,
  terminalInheritSystemProfile = true,
  terminalFontFamily = "",
  integratedTerminalShell = { mode: "auto" },
  integratedTerminalShellOptions = [],
  toolSearchMode = "off",
  onToolSearchModeChange,
  nativeSearchEnhancementsEnabled,
  httpProxy = "",
  httpProxyNoProxy = "",
  httpProxyCaCertPath = "",
  defaultHomeDir,
  isDesktop,
  isWindowsDesktop,
  isLinuxDesktop,
  linuxCloseToTray,
  showIntegratedTerminalShell = false,
  setLocalePreference,
  setNotificationEnabled,
  setNotificationSoundEnabled,
  messageStreamShowReasoning,
  messageStreamShowTodos,
  toolGroupingExploreEnabled,
  toolGroupingTerminalEnabled,
  toolGroupingChangesEnabled,
  zcodeInteractionBehavior,
  askUserQuestionAutoResolutionEnabled = true,
  modelIoFullRetentionEnabled = false,
  onDataBaseDirChange,
  onSelectDataBaseDir,
  onTerminalInheritSystemProfileChange = async () => {},
  onTerminalFontFamilyChange = async () => {},
  onIntegratedTerminalShellChange = async () => {},
  onNativeSearchEnhancementsEnabledChange,
  onHttpProxyChange = async () => {},
  onHttpProxyNoProxyChange = async () => {},
  onHttpProxyCaCertPathChange = async () => {},
  onCloseToTrayOnWindowsChange,
  onKeepAwakeWhileRunningChange = async () => {},
  onDesktopChromiumHardwareAccelerationChange = async () => {},
  onReceivePreviewUpdatesChange,
  onAutoDownloadAndInstallUpdatesChange,
  onMessageStreamShowReasoningChange,
  onMessageStreamShowTodosChange,
  onToolGroupingExploreEnabledChange,
  onToolGroupingTerminalEnabledChange,
  onToolGroupingChangesEnabledChange,
  onZCodeInteractionBehaviorChange,
  onAskUserQuestionAutoResolutionEnabledChange = async () => {},
  onModelIoFullRetentionEnabledChange = async () => {},
}: {
  localePreference: LocalePreference;
  interfaceMode?: InterfaceMode;
  setInterfaceMode?: (mode: InterfaceMode) => void;
  notificationEnabled: boolean;
  notificationSoundEnabled: boolean;
  closeToTrayOnWindows: boolean;
  keepAwakeWhileRunning?: boolean;
  desktopChromiumHardwareAccelerationEnabled?: boolean;
  receivePreviewUpdates: boolean;
  autoDownloadAndInstallUpdates: boolean;
  dataBaseDir: string;
  terminalInheritSystemProfile: boolean;
  terminalFontFamily: string;
  integratedTerminalShell?: IntegratedTerminalShellSelection;
  integratedTerminalShellOptions?: IntegratedTerminalShellOption[];
  toolSearchMode?: AppToolSearchMode;
  onToolSearchModeChange: (mode: AppToolSearchMode) => Promise<void>;
  nativeSearchEnhancementsEnabled: boolean;
  httpProxy?: string;
  httpProxyNoProxy?: string;
  httpProxyCaCertPath?: string;
  defaultHomeDir: string;
  isDesktop?: boolean;
  isWindowsDesktop?: boolean;
  /** Linux 桌面端（isDesktop 且非 win/mac）；关闭驻留托盘设置在 Linux 上按能力自适应展示 */
  isLinuxDesktop?: boolean;
  /** Linux 关闭驻留托盘能力状态（spec：docs/desktop/linux-close-to-tray.md）；Windows 不传 */
  linuxCloseToTray?: {
    /** 能力探测中或确认不可用，开关锁定 */
    disabled: boolean;
    /** 确认不可用（描述文案切换为"未提供系统托盘"） */
    unavailable: boolean;
    /** GNOME 系桌面且无托盘（追加 AppIndicator 扩展安装提示） */
    gnomeLikeHint: boolean;
  };
  showIntegratedTerminalShell?: boolean;
  platform?: IPlatformService;
  setLocalePreference: (locale: LocalePreference) => void;
  setNotificationEnabled: (enabled: boolean) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;
  messageStreamShowReasoning: boolean;
  messageStreamShowTodos: boolean;
  toolGroupingExploreEnabled: boolean;
  toolGroupingTerminalEnabled: boolean;
  toolGroupingChangesEnabled: boolean;
  zcodeInteractionBehavior: ZCodeInteractionBehavior;
  askUserQuestionAutoResolutionEnabled?: boolean;
  modelIoFullRetentionEnabled?: boolean;
  onDataBaseDirChange: (dir: string) => Promise<void>;
  onSelectDataBaseDir: () => Promise<string | null>;
  onTerminalInheritSystemProfileChange: (enabled: boolean) => Promise<void>;
  onTerminalFontFamilyChange: (fontFamily: string) => Promise<void>;
  onIntegratedTerminalShellChange?: (selection: IntegratedTerminalShellSelection) => Promise<void>;
  onNativeSearchEnhancementsEnabledChange: (enabled: boolean) => Promise<void>;
  onHttpProxyChange?: (httpProxy: string) => Promise<void>;
  onHttpProxyNoProxyChange?: (noProxy: string) => Promise<void>;
  onHttpProxyCaCertPathChange?: (caCertPath: string) => Promise<void>;
  onCloseToTrayOnWindowsChange: (enabled: boolean) => Promise<void>;
  onKeepAwakeWhileRunningChange?: (enabled: boolean) => Promise<void>;
  onDesktopChromiumHardwareAccelerationChange?: (enabled: boolean) => Promise<void>;
  onReceivePreviewUpdatesChange: (enabled: boolean) => Promise<void>;
  onAutoDownloadAndInstallUpdatesChange: (enabled: boolean) => Promise<void>;
  onMessageStreamShowReasoningChange: (enabled: boolean) => Promise<void>;
  onMessageStreamShowTodosChange: (enabled: boolean) => Promise<void>;
  onToolGroupingExploreEnabledChange: (enabled: boolean) => Promise<void>;
  onToolGroupingTerminalEnabledChange: (enabled: boolean) => Promise<void>;
  onToolGroupingChangesEnabledChange: (enabled: boolean) => Promise<void>;
  onZCodeInteractionBehaviorChange: (behavior: ZCodeInteractionBehavior) => Promise<void>;
  onAskUserQuestionAutoResolutionEnabledChange?: (enabled: boolean) => Promise<void>;
  onModelIoFullRetentionEnabledChange?: (enabled: boolean) => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const hasServices = Boolean(useOptionalServices());
  // 部分 SSR 单测会用精简 props 直接渲染本组件，新增终端设置项后旧 helper 未必同步传值。
  // 这里把运行时缺省值兜到“继承系统 profile”，避免 undefined.trim() 把无关测试打断。
  const [localTerminalFontFamily, setLocalTerminalFontFamily] = useState(terminalFontFamily);

  useEffect(() => {
    setLocalTerminalFontFamily(terminalFontFamily);
  }, [terminalFontFamily]);

  const normalizedTerminalFontFamily = localTerminalFontFamily.trim();
  const isTerminalFontFamilyDirty = normalizedTerminalFontFamily !== terminalFontFamily;
  const integratedTerminalShellValue =
    integratedTerminalShell.mode === "shell" ? integratedTerminalShell.id : "auto";
  const selectedIntegratedTerminalShellOption =
    integratedTerminalShell.mode === "shell"
      ? (integratedTerminalShellOptions.find(
          (option) => option.id === integratedTerminalShell.id,
        ) ?? {
          dialect: integratedTerminalShell.dialect,
          id: integratedTerminalShell.id,
          label: integratedTerminalShell.label,
          path: integratedTerminalShell.path,
          source: "system" as const,
        })
      : undefined;
  const visibleIntegratedTerminalShellOptions = selectedIntegratedTerminalShellOption
    ? [
        selectedIntegratedTerminalShellOption,
        ...integratedTerminalShellOptions.filter(
          (option) => option.id !== selectedIntegratedTerminalShellOption.id,
        ),
      ]
    : integratedTerminalShellOptions;

  const handleTerminalFontFamilySave = useCallback(async () => {
    await onTerminalFontFamilyChange(normalizedTerminalFontFamily);
  }, [normalizedTerminalFontFamily, onTerminalFontFamilyChange]);

  const handleIntegratedTerminalShellChange = useCallback(
    async (value: string) => {
      if (value === "auto") {
        await onIntegratedTerminalShellChange({ mode: "auto" });
        return;
      }
      const option = visibleIntegratedTerminalShellOptions.find(
        (candidate) => candidate.id === value,
      );
      if (!option) {
        return;
      }
      await onIntegratedTerminalShellChange({
        mode: "shell",
        dialect: option.dialect,
        id: option.id,
        label: option.label,
        path: option.path,
      });
    },
    [onIntegratedTerminalShellChange, visibleIntegratedTerminalShellOptions],
  );

  const [localHttpProxy, setLocalHttpProxy] = useState(httpProxy);

  useEffect(() => {
    setLocalHttpProxy(httpProxy);
  }, [httpProxy]);

  const normalizedHttpProxy = localHttpProxy.trim();
  const isHttpProxyDirty = normalizedHttpProxy !== httpProxy;

  const handleHttpProxySave = useCallback(async () => {
    await onHttpProxyChange(normalizedHttpProxy);
  }, [normalizedHttpProxy, onHttpProxyChange]);

  const [localHttpProxyNoProxy, setLocalHttpProxyNoProxy] = useState(httpProxyNoProxy);

  useEffect(() => {
    setLocalHttpProxyNoProxy(httpProxyNoProxy);
  }, [httpProxyNoProxy]);

  const normalizedHttpProxyNoProxy = localHttpProxyNoProxy
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .join(",");
  const isHttpProxyNoProxyDirty = normalizedHttpProxyNoProxy !== httpProxyNoProxy;

  const handleHttpProxyNoProxySave = useCallback(async () => {
    await onHttpProxyNoProxyChange(normalizedHttpProxyNoProxy);
  }, [normalizedHttpProxyNoProxy, onHttpProxyNoProxyChange]);

  const [localHttpProxyCaCertPath, setLocalHttpProxyCaCertPath] = useState(httpProxyCaCertPath);

  useEffect(() => {
    setLocalHttpProxyCaCertPath(httpProxyCaCertPath);
  }, [httpProxyCaCertPath]);

  const normalizedHttpProxyCaCertPath = localHttpProxyCaCertPath.trim();
  const isHttpProxyCaCertPathDirty = normalizedHttpProxyCaCertPath !== httpProxyCaCertPath;

  const handleHttpProxyCaCertPathSave = useCallback(async () => {
    await onHttpProxyCaCertPathChange(normalizedHttpProxyCaCertPath);
  }, [normalizedHttpProxyCaCertPath, onHttpProxyCaCertPathChange]);

  return (
    <div className="space-y-4">
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.locale" })}
          description={intl.formatMessage({ id: "settings.localeDescription" })}
          control={
            <Select
              value={localePreference}
              onValueChange={(value) => setLocalePreference(value as LocalePreference)}
            >
              <SelectTrigger
                size="lg"
                className="w-[260px] min-w-0 justify-between"
                data-testid={TID_SETTINGS_LOCALE_SELECT_TRIGGER}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="system"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "system")}
                >
                  {intl.formatMessage({ id: "settings.locale.system" })}
                </SelectItem>
                <SelectItem
                  value="zh-CN"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "zh-CN")}
                >
                  {intl.formatMessage({ id: "settings.locale.zh-CN" })}
                </SelectItem>
                <SelectItem
                  value="en-US"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "en-US")}
                >
                  {intl.formatMessage({ id: "settings.locale.en-US" })}
                </SelectItem>
                <SelectItem
                  value="ru-RU"
                  data-testid={testId(TID_SETTINGS_LOCALE_SELECT_ITEM, "ru-RU")}
                >
                  {intl.formatMessage({ id: "settings.locale.ru-RU" })}
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.interfaceMode" })}
          description={intl.formatMessage({ id: "settings.interfaceMode.description" })}
          control={
            <Select
              value={interfaceMode}
              onValueChange={(value) => setInterfaceMode(normalizeInterfaceMode(value))}
            >
              <SelectTrigger
                size="lg"
                className="w-full min-w-0 sm:w-64"
                aria-label={intl.formatMessage({ id: "settings.interfaceMode" })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coding">
                  {intl.formatMessage({ id: "settings.interfaceMode.coding" })}
                </SelectItem>
                <SelectItem value="office">
                  {intl.formatMessage({ id: "settings.interfaceMode.office" })}
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {hasServices ? <ProactiveSuggestionsSetting /> : null}
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.terminalProfile" })}
          description={intl.formatMessage({ id: "settings.terminalProfileDescription" })}
          control={
            <Switch
              checked={terminalInheritSystemProfile}
              onCheckedChange={(checked) => {
                void onTerminalInheritSystemProfileChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.terminalFontFamily" })}
          description={intl.formatMessage({ id: "settings.terminalFontFamilyDescription" })}
          control={
            <Button
              type="button"
              size="lg"
              disabled={!isTerminalFontFamilyDirty}
              onClick={() => void handleTerminalFontFamilySave()}
            >
              {intl.formatMessage({ id: "settings.dataBaseDirSave" })}
            </Button>
          }
          detail={
            <Input
              size="lg"
              value={localTerminalFontFamily}
              placeholder={intl.formatMessage({
                id: "settings.terminalFontFamilyPlaceholder",
              })}
              onChange={(event) => {
                setLocalTerminalFontFamily(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isTerminalFontFamilyDirty) {
                  void handleTerminalFontFamilySave();
                }
              }}
              className="max-w-[520px] font-mono"
            />
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        {showIntegratedTerminalShell ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.integratedTerminalShell" })}
            description={intl.formatMessage({
              id: "settings.integratedTerminalShellDescription",
            })}
            control={
              <Select
                value={integratedTerminalShellValue}
                onValueChange={(value) => {
                  void handleIntegratedTerminalShellChange(value);
                }}
              >
                <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {intl.formatMessage({ id: "settings.integratedTerminalShell.auto" })}
                  </SelectItem>
                  {visibleIntegratedTerminalShellOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        ) : null}
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolSearch" })}
          description={intl.formatMessage({ id: "settings.toolSearchDescription" })}
          detail={
            <p className="text-ui-sm leading-5 text-foreground-subtle">
              {intl.formatMessage({ id: "settings.toolSearchExperimentalNotice" })}
            </p>
          }
          control={
            <Select
              value={toolSearchMode}
              onValueChange={(value) => {
                void onToolSearchModeChange(appToolSearchModeSchema.parse(value));
              }}
            >
              <SelectTrigger
                size="lg"
                className="w-[260px] min-w-0 justify-between"
                data-testid={TID_SETTINGS_TOOL_SEARCH_SELECT}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {appToolSearchModeSchema.options.map((mode) => (
                  <SelectItem
                    key={mode}
                    value={mode}
                    data-testid={testId(TID_SETTINGS_TOOL_SEARCH_OPTION, mode)}
                  >
                    {intl.formatMessage({ id: `settings.toolSearch.${mode}` })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          label={intl.formatMessage({
            id: "settings.nativeSearchEnhancements",
          })}
          description={intl.formatMessage({
            id: "settings.nativeSearchEnhancementsDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({
                id: "settings.nativeSearchEnhancements",
              })}
              checked={nativeSearchEnhancementsEnabled}
              data-testid={TID_SETTINGS_NATIVE_SEARCH_SWITCH}
              onCheckedChange={(checked) => {
                void onNativeSearchEnhancementsEnabledChange(checked);
              }}
            />
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.httpProxy" })}
          description={intl.formatMessage({ id: "settings.httpProxyDescription" })}
          control={
            <Button
              type="button"
              size="lg"
              disabled={!isHttpProxyDirty}
              onClick={() => void handleHttpProxySave()}
            >
              {intl.formatMessage({ id: "settings.dataBaseDirSave" })}
            </Button>
          }
          detail={
            <Input
              size="lg"
              value={localHttpProxy}
              placeholder={intl.formatMessage({
                id: "settings.httpProxyPlaceholder",
              })}
              onChange={(event) => {
                setLocalHttpProxy(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isHttpProxyDirty) {
                  void handleHttpProxySave();
                }
              }}
              className="max-w-[520px] font-mono"
            />
          }
        />
        {/* No Proxy 与 HTTP 代理共同决定同一出口策略，必须贴在代理地址下面。*/}
        <SettingsRow
          label={intl.formatMessage({ id: "settings.httpProxyNoProxy" })}
          description={intl.formatMessage({
            id: "settings.httpProxyNoProxyDescription",
          })}
          control={
            <Button
              type="button"
              size="lg"
              disabled={!isHttpProxyNoProxyDirty}
              onClick={() => void handleHttpProxyNoProxySave()}
            >
              {intl.formatMessage({ id: "settings.dataBaseDirSave" })}
            </Button>
          }
          detail={
            <Input
              size="lg"
              value={localHttpProxyNoProxy}
              placeholder={intl.formatMessage({
                id: "settings.httpProxyNoProxyPlaceholder",
              })}
              onChange={(event) => {
                setLocalHttpProxyNoProxy(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isHttpProxyNoProxyDirty) {
                  void handleHttpProxyNoProxySave();
                }
              }}
              className="max-w-[520px] font-mono"
            />
          }
        />
        {/* 自定义 CA 属于 HTTP 代理的同一网络出口策略，必须跟代理输入放在同一卡片里。*/}
        <SettingsRow
          label={intl.formatMessage({ id: "settings.httpProxyCaCertPath" })}
          description={intl.formatMessage({
            id: "settings.httpProxyCaCertPathDescription",
          })}
          control={
            <Button
              type="button"
              size="lg"
              disabled={!isHttpProxyCaCertPathDirty}
              onClick={() => void handleHttpProxyCaCertPathSave()}
            >
              {intl.formatMessage({ id: "settings.dataBaseDirSave" })}
            </Button>
          }
          detail={
            <Input
              size="lg"
              value={localHttpProxyCaCertPath}
              placeholder={intl.formatMessage({
                id: "settings.httpProxyCaCertPathPlaceholder",
              })}
              onChange={(event) => {
                setLocalHttpProxyCaCertPath(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isHttpProxyCaCertPathDirty) {
                  void handleHttpProxyCaCertPathSave();
                }
              }}
              className="max-w-[520px] font-mono"
            />
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        {isDesktop ? (
          <>
            <SettingsRow
              label={intl.formatMessage({
                id: "settings.desktopChromiumHardwareAcceleration",
              })}
              description={intl.formatMessage({
                id: "settings.desktopChromiumHardwareAccelerationDescription",
              })}
              control={
                <Switch
                  aria-label={intl.formatMessage({
                    id: "settings.desktopChromiumHardwareAcceleration",
                  })}
                  checked={desktopChromiumHardwareAccelerationEnabled}
                  onCheckedChange={(checked) => {
                    void onDesktopChromiumHardwareAccelerationChange(checked);
                  }}
                />
              }
            />
            <SettingsRow
              label={intl.formatMessage({ id: "settings.receivePreviewUpdates" })}
              description={intl.formatMessage({
                id: "settings.receivePreviewUpdatesDescription",
              })}
              control={
                <Switch
                  aria-label={intl.formatMessage({ id: "settings.receivePreviewUpdates" })}
                  checked={receivePreviewUpdates}
                  onCheckedChange={(checked) => {
                    void onReceivePreviewUpdatesChange(checked);
                  }}
                />
              }
            />
            <SettingsRow
              label={intl.formatMessage({
                id: "settings.autoDownloadAndInstallUpdates",
              })}
              description={intl.formatMessage({
                id: "settings.autoDownloadAndInstallUpdatesDescription",
              })}
              control={
                <Switch
                  aria-label={intl.formatMessage({
                    id: "settings.autoDownloadAndInstallUpdates",
                  })}
                  checked={autoDownloadAndInstallUpdates}
                  onCheckedChange={(checked) => {
                    void onAutoDownloadAndInstallUpdatesChange(checked);
                  }}
                />
              }
            />
          </>
        ) : null}
        <SettingsRow
          label={intl.formatMessage({ id: "settings.notification" })}
          description={intl.formatMessage({
            id: "settings.notificationDescription",
          })}
          control={
            <Switch checked={notificationEnabled} onCheckedChange={setNotificationEnabled} />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.notificationSound" })}
          description={intl.formatMessage({
            id: "settings.notificationSoundDescription",
          })}
          control={
            <Switch
              checked={notificationSoundEnabled}
              disabled={!notificationEnabled}
              onCheckedChange={setNotificationSoundEnabled}
            />
          }
        />
        {isWindowsDesktop || isLinuxDesktop ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.closeToTrayOnWindows" })}
            description={
              linuxCloseToTray?.unavailable
                ? linuxCloseToTray.gnomeLikeHint
                  ? `${intl.formatMessage({ id: "settings.closeToTrayUnavailable" })} ${intl.formatMessage({ id: "settings.closeToTrayGnomeHint" })}`
                  : intl.formatMessage({ id: "settings.closeToTrayUnavailable" })
                : intl.formatMessage({
                    id: "settings.closeToTrayOnWindowsDescription",
                  })
            }
            control={
              <Switch
                checked={closeToTrayOnWindows}
                // Linux 上托盘能力未知（探测中）或确认不可用时都锁定，防止误开导致关窗失联
                //（spec：docs/desktop/linux-close-to-tray.md）。
                disabled={Boolean(linuxCloseToTray?.disabled)}
                onCheckedChange={(checked) => {
                  void onCloseToTrayOnWindowsChange(checked);
                }}
              />
            }
          />
        ) : null}
        {isDesktop ? (
          <SettingsRow
            label={intl.formatMessage({ id: "settings.keepAwakeWhileRunning" })}
            description={intl.formatMessage({
              id: "settings.keepAwakeWhileRunningDescription",
            })}
            control={
              <Switch
                aria-label={intl.formatMessage({
                  id: "settings.keepAwakeWhileRunning",
                })}
                checked={keepAwakeWhileRunning}
                onCheckedChange={(checked) => {
                  void onKeepAwakeWhileRunningChange(checked);
                }}
              />
            }
          />
        ) : null}
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.zcodeInteractionBehavior" })}
          description={intl.formatMessage({
            id: "settings.zcodeInteractionBehaviorDescription",
          })}
          control={
            <Select
              value={zcodeInteractionBehavior}
              onValueChange={(value) => {
                void onZCodeInteractionBehaviorChange(value as ZCodeInteractionBehavior);
              }}
            >
              <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZCODE_INTERACTION_BEHAVIOR_OPTIONS.map((behavior) => (
                  <SelectItem key={behavior} value={behavior}>
                    {intl.formatMessage({
                      id: `settings.zcodeInteractionBehavior.option.${behavior}`,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          label={intl.formatMessage({
            id: "settings.askUserQuestionAutoResolution",
          })}
          description={intl.formatMessage({
            id: "settings.askUserQuestionAutoResolutionDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({
                id: "settings.askUserQuestionAutoResolution",
              })}
              checked={askUserQuestionAutoResolutionEnabled}
              data-testid={TID_SETTINGS_ASK_USER_QUESTION_AUTO_RESOLUTION_SWITCH}
              onCheckedChange={(checked) => {
                void onAskUserQuestionAutoResolutionEnabledChange(checked);
              }}
            />
          }
        />
        {/* docs/dynamic-workflow/launch.md「The user's choice」：服务端未提供时整行不渲染。 */}
        {hasServices ? <DynamicWorkflowModeSetting /> : null}
        <SettingsRow
          label={intl.formatMessage({ id: "settings.modelIoFullRetention" })}
          description={intl.formatMessage({
            id: "settings.modelIoFullRetentionDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.modelIoFullRetention" })}
              checked={modelIoFullRetentionEnabled}
              onCheckedChange={(checked) => {
                void onModelIoFullRetentionEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.messageStreamShowReasoning" })}
          description={intl.formatMessage({
            id: "settings.messageStreamShowReasoningDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.messageStreamShowReasoning" })}
              checked={messageStreamShowReasoning}
              onCheckedChange={(checked) => {
                void onMessageStreamShowReasoningChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.messageStreamShowTodos" })}
          description={intl.formatMessage({
            id: "settings.messageStreamShowTodosDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.messageStreamShowTodos" })}
              checked={messageStreamShowTodos}
              onCheckedChange={(checked) => {
                void onMessageStreamShowTodosChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolGroupingExplore" })}
          description={intl.formatMessage({
            id: "settings.toolGroupingExploreDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.toolGroupingExplore" })}
              checked={toolGroupingExploreEnabled}
              onCheckedChange={(checked) => {
                void onToolGroupingExploreEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolGroupingTerminal" })}
          description={intl.formatMessage({
            id: "settings.toolGroupingTerminalDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.toolGroupingTerminal" })}
              checked={toolGroupingTerminalEnabled}
              onCheckedChange={(checked) => {
                void onToolGroupingTerminalEnabledChange(checked);
              }}
            />
          }
        />
        <SettingsRow
          label={intl.formatMessage({ id: "settings.toolGroupingChanges" })}
          description={intl.formatMessage({
            id: "settings.toolGroupingChangesDescription",
          })}
          control={
            <Switch
              aria-label={intl.formatMessage({ id: "settings.toolGroupingChanges" })}
              checked={toolGroupingChangesEnabled}
              onCheckedChange={(checked) => {
                void onToolGroupingChangesEnabledChange(checked);
              }}
            />
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.dataBaseDir" })}
          description={intl.formatMessage({
            id: "settings.dataBaseDirDescription",
          })}
          control={
            <DataBaseDirControl
              dataBaseDir={dataBaseDir}
              defaultHomeDir={defaultHomeDir}
              onDataBaseDirChange={onDataBaseDirChange}
              onSelectDataBaseDir={onSelectDataBaseDir}
            />
          }
        />
      </SettingsGroupCard>

      <ImportFromOriginalZCodeSetting isDesktop={isDesktop} />
    </div>
  );
}

export function GeneralSectionHeader({ localePreference }: { localePreference: LocalePreference }) {
  const { intl } = useZCodeIntl();

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <SettingsBadge>
        {intl.formatMessage({ id: `settings.locale.${localePreference}` })}
      </SettingsBadge>
    </div>
  );
}

type ImportCategoryId =
  | "providers"
  | "plugins"
  | "settings"
  | "skills"
  | "projects"
  | "remoteDevices"
  | "mcp"
  | "memory";

const IMPORT_CATEGORIES: readonly ImportCategoryId[] = [
  "providers",
  "plugins",
  "settings",
  "skills",
  "projects",
  "remoteDevices",
  "mcp",
  "memory",
];

/** По умолчанию переносим конфигурацию; историю, устройства и память — только по явному выбору. */
const DEFAULT_IMPORT_SELECTION: Record<ImportCategoryId, boolean> = {
  providers: true,
  plugins: true,
  settings: true,
  skills: true,
  projects: false,
  remoteDevices: false,
  mcp: true,
  memory: false,
};

interface ImportFromOriginalZCodeResponse {
  sourceDir: string | null;
  copiedFiles: string[];
  mergedFiles: string[];
  errors: string[];
  missingPaths?: string[];
  importedRows?: number;
}

/** MyZCode: перенос конфигов/данных из оригинального ZCode в изолированный корень MyZCode. */
function ImportFromOriginalZCodeSetting({ isDesktop }: { isDesktop?: boolean }) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const [selection, setSelection] =
    useState<Record<ImportCategoryId, boolean>>(DEFAULT_IMPORT_SELECTION);
  const [running, setRunning] = useState(false);
  const [remappingPath, setRemappingPath] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [missingPaths, setMissingPaths] = useState<string[]>([]);

  const selectedCount = IMPORT_CATEGORIES.filter((id) => selection[id]).length;

  const handleImport = useCallback(async () => {
    if (running) {
      return;
    }
    const categories = IMPORT_CATEGORIES.filter((id) => selection[id]);
    if (categories.length === 0) {
      setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.selectAtLeastOne" }));
      return;
    }
    setRunning(true);
    setSummary(null);
    setMissingPaths([]);
    try {
      const result = (await platform.executeDesktopCommand(
        DesktopCommandIds.ImportFromOriginalZCode,
        { categories },
      )) as ImportFromOriginalZCodeResponse | undefined;
      if (!result) {
        setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.failed" }));
        return;
      }
      setMissingPaths(result.missingPaths ?? []);
      if (result.errors.includes("original-not-found")) {
        setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.failedNotFound" }));
        return;
      }
      if (result.errors.includes("same-dir")) {
        setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.failedSameDir" }));
        return;
      }
      const files = result.copiedFiles.length + result.mergedFiles.length;
      const rows = result.importedRows ?? 0;
      setSummary(
        result.errors.length === 0
          ? intl.formatMessage(
              { id: "settings.importFromOriginalZCode.doneDetailed" },
              { files, rows },
            )
          : intl.formatMessage(
              { id: "settings.importFromOriginalZCode.partial" },
              { files, rows, errors: result.errors.length },
            ),
      );
    } catch {
      setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.failed" }));
    } finally {
      setRunning(false);
    }
  }, [intl, platform, running, selection]);

  const handleRemap = useCallback(
    async (from: string) => {
      if (remappingPath) {
        return;
      }
      const to = await platform.selectDirectory();
      if (!to) {
        return;
      }
      setRemappingPath(from);
      setSummary(null);
      try {
        const result = (await platform.executeDesktopCommand(
          DesktopCommandIds.ImportFromOriginalZCode,
          { remapProjectPaths: [{ from, to }] },
        )) as ImportFromOriginalZCodeResponse | undefined;
        if (!result || result.errors.length > 0) {
          setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.remapFailed" }));
          return;
        }
        setMissingPaths(result.missingPaths ?? []);
        setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.remapDone" }));
      } catch {
        setSummary(intl.formatMessage({ id: "settings.importFromOriginalZCode.remapFailed" }));
      } finally {
        setRemappingPath(null);
      }
    },
    [intl, platform, remappingPath],
  );

  if (!isDesktop) {
    return null;
  }

  return (
    <SettingsGroupCard>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div>
          <div className="font-medium text-foreground">
            {intl.formatMessage({ id: "settings.importFromOriginalZCode" })}
          </div>
          <p className="mt-1 text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.importFromOriginalZCodeDescription" })}
          </p>
        </div>

        <div>
          <div className="mb-2 text-ui-sm font-medium text-foreground-subtle">
            {intl.formatMessage({ id: "settings.importFromOriginalZCode.categoriesLabel" })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {IMPORT_CATEGORIES.map((id) => (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2 text-ui-base text-foreground"
              >
                <Checkbox
                  checked={selection[id]}
                  disabled={running}
                  onCheckedChange={(checked) =>
                    setSelection((current) => ({ ...current, [id]: checked === true }))
                  }
                />
                <span>
                  {intl.formatMessage({ id: `settings.importFromOriginalZCode.category.${id}` })}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={running || selectedCount === 0}
            onClick={() => void handleImport()}
          >
            {intl.formatMessage({
              id: running
                ? "settings.importFromOriginalZCode.running"
                : "settings.importFromOriginalZCode.run",
            })}
          </Button>
        </div>

        {summary ? <div className="text-ui-sm text-foreground-subtle">{summary}</div> : null}

        {missingPaths.length > 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3">
            <div className="text-ui-base font-medium text-amber-700 dark:text-amber-300">
              {intl.formatMessage({ id: "settings.importFromOriginalZCode.missingTitle" })}
            </div>
            <p className="mt-1 text-ui-sm text-foreground-subtle">
              {intl.formatMessage({ id: "settings.importFromOriginalZCode.missingHint" })}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {missingPaths.map((path) => (
                <li key={path} className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-ui-sm">
                    {path}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={remappingPath !== null}
                    onClick={() => void handleRemap(path)}
                  >
                    {intl.formatMessage({
                      id:
                        remappingPath === path
                          ? "settings.importFromOriginalZCode.remapping"
                          : "settings.importFromOriginalZCode.chooseFolder",
                    })}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SettingsGroupCard>
  );
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert as RNAlert, type TextInputProps } from "react-native";
import { AppDialogButton, AppDialogModal } from "@/components/ui/AppDialogModal";

type AlertOptions = {
  title?: string;
  message: string;
  buttonText?: string;
};

type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type DialogOptions = {
  title?: string;
  message?: string;
  buttons: AppDialogButton[];
  input?: {
    placeholder?: string;
    defaultValue?: string;
    keyboardType?: TextInputProps["keyboardType"];
    secureTextEntry?: boolean;
  };
};

type DialogContextValue = {
  dialog: (options: DialogOptions) => Promise<number>;
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: {
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    secureTextEntry?: boolean;
    keyboardType?: TextInputProps["keyboardType"];
    buttons: Array<{
      text?: string;
      style?: "default" | "cancel" | "destructive";
      icon?: AppDialogButton["icon"];
      onPress?: (value?: string) => void;
    }>;
  }) => Promise<void>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

// --- Imperative bridge (so you can replace `react-native` Alert usage) ---
type AlertLikeButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: "default" | "cancel" | "destructive";
  icon?: AppDialogButton["icon"];
};

type AlertLikeOptions = {
  cancelable?: boolean;
  onDismiss?: (() => void) | undefined;
};

let dialogApi: DialogContextValue | null = null;

function mapAlertButtons(buttons?: AlertLikeButton[]): AppDialogButton[] {
  if (!buttons?.length) return [];
  return buttons.map((b) => ({
    text: b.text ?? "OK",
    variant:
      b.style === "cancel" ? "cancel" : b.style === "destructive" ? "destructive" : "default",
    onPress: () => b.onPress?.(),
    icon: b.icon,
  }));
}

// `Alert.alert(title, message?, buttons?, options?)` + `Alert.prompt(...)` (custom)
export const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertLikeButton[],
    options?: AlertLikeOptions
  ) => {
    if (!dialogApi) {
      RNAlert.alert(title, message, buttons as any, options as any);
      return;
    }

    const mapped = mapAlertButtons(buttons);
    const finalButtons: AppDialogButton[] =
      mapped.length > 0
        ? mapped
        : [
            {
              text: "OK",
              variant: "default",
              onPress: () => undefined,
            },
          ];

    dialogApi
      .dialog({
        title,
        message: message ?? "",
        buttons: finalButtons,
      })
      .then(() => void 0)
      .catch(() => void 0);
  },

  prompt: (
    title: string,
    message?: string,
    buttons?: AlertLikeButton[],
    type?: "plain-text" | "secure-text" | "login-password",
    defaultValue?: string,
    keyboardType?: TextInputProps["keyboardType"]
  ) => {
    if (!dialogApi) {
      // fallback (dev safety)
      RNAlert.alert(title, message ?? "", [{ text: "OK" }]);
      return;
    }

    const fallbackButtons: AlertLikeButton[] = [
      { text: "Cancel", style: "cancel" },
      { text: "OK", style: "default" },
    ];

    const sourceButtons: AlertLikeButton[] = buttons?.length ? buttons : fallbackButtons;

    const finalButtons: Array<{
      text?: string;
      style?: "default" | "cancel" | "destructive";
      icon?: AppDialogButton["icon"];
      onPress?: (value?: string) => void;
    }> = sourceButtons.map((b) => ({
      text: b.text,
      style: b.style,
      icon: b.icon,
      onPress: b.onPress,
    }));

    dialogApi
      .prompt({
        title,
        message,
        defaultValue,
        secureTextEntry: type === "secure-text" || type === "login-password",
        keyboardType,
        buttons: finalButtons,
      })
      .then(() => void 0)
      .catch(() => void 0);
  },
  confirm: async ({
    title,
    message,
    confirmText,
    cancelText,
    destructive,
  }: {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  }) => {
    if (!dialogApi) {
      return new Promise<boolean>((resolve) => {
        RNAlert.alert(title ?? "", message ?? "", [
          { text: cancelText ?? "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: confirmText ?? "OK", style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
        ] as any);
      });
    }

    try {
      return await dialogApi.confirm({ title, message, confirmText, cancelText, destructive });
    } catch {
      return false;
    }
  },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [buttons, setButtons] = useState<AppDialogButton[]>([]);

  const [input, setInput] = useState<DialogOptions["input"] | null>(null);
  const [inputText, setInputText] = useState<string>("");
  const inputTextRef = useRef<string>("");
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  const queueRef = useRef<Array<() => void>>([]);

  const runNext = useCallback(() => {
    const next = queueRef.current.shift();
    next?.();
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setTitle(undefined);
    setMessage(undefined);
    setButtons([]);
    setInput(null);
    setInputText("");

    setTimeout(runNext, 0);
  }, [runNext]);

  const enqueueOrRun = useCallback(
    (fn: () => void) => {
      if (visible) queueRef.current.push(fn);
      else fn();
    },
    [visible]
  );

  const dialog = useCallback(
    async ({ title, message, buttons, input }: DialogOptions) => {
      return new Promise<number>((resolve) => {
        const run = () => {
            // Defer applying state to avoid calling setState synchronously during
            // React commit/unmount phases (this can trigger maximum update depth
            // errors when other components mount/unmount Modals). Scheduling with
            // setTimeout ensures the dialog UI is mounted after the current
            // render cycle completes.
            setTimeout(() => {
              setTitle(title);
              setMessage(message);

              setInput(input ?? null);
              setInputText(input?.defaultValue ?? "");

              const wrapped: AppDialogButton[] = buttons.map((b, idx) => {
                const original = b.onPress as any;
                return {
                  ...b,
                  variant: b.variant ?? "default",
                  onPress: () => {
                    const value = input ? inputTextRef.current : undefined;
                    close();
                    resolve(idx);
                    original?.(value);
                  },
                };
              });

              setButtons(wrapped);
              setVisible(true);
            }, 0);
        };

        enqueueOrRun(run);
      });
    },
    [close, enqueueOrRun]
  );

  const alert = useCallback(
    async ({ title, message, buttonText }: AlertOptions) => {
      await dialog({
        title,
        message,
        buttons: [
          {
            text: buttonText ?? "OK",
            variant: "default",
            onPress: () => undefined,
          },
        ],
      });
    },
    [dialog]
  );

  const confirm = useCallback(
    async ({ title, message, confirmText, cancelText, destructive }: ConfirmOptions) => {
      const pressed = await dialog({
        title,
        message,
        buttons: [
          { text: cancelText ?? "Cancel", variant: "cancel", onPress: () => undefined },
          { text: confirmText ?? "OK", variant: destructive ? "destructive" : "default", onPress: () => undefined },
        ],
      });
      return pressed === 1;
    },
    [dialog]
  );

  const prompt = useCallback(
    async ({
      title,
      message,
      defaultValue,
      placeholder,
      secureTextEntry,
      keyboardType,
      buttons,
    }: {
      title: string;
      message?: string;
      defaultValue?: string;
      placeholder?: string;
      secureTextEntry?: boolean;
      keyboardType?: TextInputProps["keyboardType"];
      buttons: Array<{
        text?: string;
        style?: "default" | "cancel" | "destructive";
        icon?: AppDialogButton["icon"];
        onPress?: (value?: string) => void;
      }>;
    }) => {
      await dialog({
        title,
        message,
        input: { defaultValue, placeholder, secureTextEntry, keyboardType },
        buttons: buttons.map((b) => ({
          text: b.text ?? "OK",
          variant: b.style === "cancel" ? "cancel" : b.style === "destructive" ? "destructive" : "default",
          icon: b.icon,
          onPress: b.onPress as any,
        })),
      });
    },
    [dialog]
  );

  const value = useMemo<DialogContextValue>(() => ({ dialog, alert, confirm, prompt }), [
    dialog,
    alert,
    confirm,
    prompt,
  ]);

  useEffect(() => {
    dialogApi = value;
    return () => {
      if (dialogApi === value) dialogApi = null;
    };
  }, [value]);

  // NOTE: During debugging of a nested update loop we allow disabling the
  // app-level dialog modal via env to avoid mounting modal internals which
  // can interact badly with navigation modals. Set DISABLE_APP_DIALOGS=1
  // in the env to skip rendering the modal UI.
  const disableAppDialogs = String(process.env.DISABLE_APP_DIALOGS ?? "").trim() === "1";

  return (
    <DialogContext.Provider value={value}>
      {children}
      {!disableAppDialogs ? (
        <AppDialogModal
          visible={visible}
          title={title}
          message={message}
          buttons={buttons}
          input={
            input
              ? {
                  value: inputText,
                  onChangeText: setInputText,
                  placeholder: input.placeholder,
                  keyboardType: input.keyboardType,
                  secureTextEntry: input.secureTextEntry,
                  autoFocus: true,
                }
              : undefined
          }
          onRequestClose={() => {
            const cancelBtn = buttons.find((b) => b.variant === "cancel");
            (cancelBtn ?? buttons[0])?.onPress?.();
          }}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
import { Alert, Platform } from 'react-native';
import type { AlertButton } from 'react-native';

// react-native-web's Alert.alert does nothing, and the web is where everyone
// uses the app. So a failed upload, a wrong current password, a message that
// did not send, all said nothing, and looked as though they had worked
// (database/SOP-GAPS.md, item 5). On the web this shows the browser's own box
// instead. Imported once, first thing, in App.tsx.
//
// Every call today is a title and a message. Should one ever pass buttons,
// two or more become OK and Cancel: the button marked 'cancel', or worded
// like it, is Cancel; the last of the others is OK.

const looksLikeCancel = (b: AlertButton) =>
  b.style === 'cancel' || /^(cancel|no\b|keep|not now|back)/i.test(b.text ?? '');

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    if (list.length < 2) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const cancel = list.find(looksLikeCancel);
    const ok = [...list].reverse().find(b => !looksLikeCancel(b)) ?? list[list.length - 1];
    if (window.confirm(text)) ok.onPress?.();
    else cancel?.onPress?.();
  };
}

import { useEffect, useRef } from "react";

// NotificationBell phát sự kiện này mỗi khi nhận thông báo realtime qua socket
export const NOTIFICATION_EVENT = "app-notification";

export const emitNotificationEvent = (notification) =>
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: notification }));

// Gọi handler khi có thông báo realtime thuộc một trong các loại `types`
// (vd tải lại danh sách tin khi tin vừa được duyệt / bị từ chối)
const useNotificationEvent = (types, handler) => {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const typesKey = types.join(",");
  useEffect(() => {
    const allowed = typesKey.split(",");
    const onEvent = (e) => {
      if (allowed.includes(e.detail?.type)) handlerRef.current(e.detail);
    };
    window.addEventListener(NOTIFICATION_EVENT, onEvent);
    return () => window.removeEventListener(NOTIFICATION_EVENT, onEvent);
  }, [typesKey]);
};

export default useNotificationEvent;

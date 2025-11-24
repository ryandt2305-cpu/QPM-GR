export type NotificationLevel = 'info' | 'success' | 'warn' | 'error';
export interface NotificationAction {
    label: string;
    onClick: () => void;
}
export interface NotificationEvent {
    id: string;
    feature: string;
    level: NotificationLevel;
    message: string;
    timestamp: number;
    actions?: NotificationAction[];
}
type NotificationSubscriber = (events: NotificationEvent[]) => void;
export declare function getNotifications(): NotificationEvent[];
export declare function notify(evt: Omit<NotificationEvent, 'id' | 'timestamp'>): NotificationEvent;
export declare function onNotifications(callback: NotificationSubscriber): () => void;
export declare function removeNotification(id: string): void;
export declare function clearNotifications(feature?: string): void;
export {};
//# sourceMappingURL=notifications.d.ts.map
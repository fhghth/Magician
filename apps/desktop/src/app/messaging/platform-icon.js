import { jsx as _jsx } from "react/jsx-runtime";
import { SiApple, SiBilibili, SiDiscord, SiGmail, SiHomeassistant, SiMatrix, SiMattermost, SiQq, SiSignal, SiTelegram, SiWechat, SiWhatsapp } from '@icons-pack/react-simple-icons';
import { Globe, Link as LinkIcon, MessageSquareText } from '@/lib/icons';
import { cn } from '@/lib/utils';
const PLATFORM_ICONS = {
    telegram: { Icon: SiTelegram, color: '#26A5E4', kind: 'brand' },
    discord: { Icon: SiDiscord, color: '#5865F2', kind: 'brand' },
    // Slack removed from Simple Icons by Salesforce request — letter monogram.
    slack: { color: '#4A154B', kind: 'brand', monogram: 'S' },
    mattermost: { Icon: SiMattermost, color: '#0058CC', kind: 'brand' },
    matrix: { Icon: SiMatrix, color: '#000000', kind: 'brand' },
    signal: { Icon: SiSignal, color: '#3A76F0', kind: 'brand' },
    whatsapp: { Icon: SiWhatsapp, color: '#25D366', kind: 'brand' },
    bluebubbles: { Icon: SiApple, color: '#0BD318', kind: 'brand' },
    homeassistant: { Icon: SiHomeassistant, color: '#18BCF2', kind: 'brand' },
    email: { Icon: SiGmail, color: '#EA4335', kind: 'brand' },
    sms: { Icon: MessageSquareText, color: '#F43F5E', kind: 'generic' },
    webhook: { Icon: LinkIcon, color: '#71717A', kind: 'generic' },
    api_server: { Icon: Globe, color: '#64748B', kind: 'generic' },
    weixin: { Icon: SiWechat, color: '#07C160', kind: 'brand' },
    qqbot: { Icon: SiQq, color: '#EB1923', kind: 'brand' },
    yuanbao: { Icon: SiBilibili, color: '#FB7299', kind: 'brand' }
};
export function PlatformAvatar({ className, platformId, platformName }) {
    const spec = PLATFORM_ICONS[platformId];
    const baseClass = cn('inline-grid size-6 shrink-0 place-items-center rounded-md text-[length:var(--conversation-caption-font-size)] font-medium', className);
    if (!spec) {
        return (_jsx("span", { "aria-hidden": "true", className: cn(baseClass, 'bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)'), children: platformName.charAt(0).toUpperCase() }));
    }
    const { Icon, color } = spec;
    return (_jsx("span", { "aria-hidden": "true", className: baseClass, style: {
            // 16% tint of the brand color so the glyph reads against any surface
            // without the avatar dominating the row.
            backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
            color
        }, children: Icon ? _jsx(Icon, { className: "size-3.5" }) : spec.monogram || platformName.charAt(0).toUpperCase() }));
}

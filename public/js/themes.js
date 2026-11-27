/* =========================================================================
   E-WIP THEME REGISTRY & LIVE SWITCHER ENGINE (PURE JAVASCRIPT)
   Manages 8 built-in themes + smooth transitions + localStorage + live Chart/UI sync
   ========================================================================= */

(function () {
    const STORAGE_KEY = 'ewip_active_theme';
    const DEFAULT_THEME_ID = 'macos-glass';

    const EWIP_THEMES = {
        'default': {
            id: 'default',
            name: 'Default Terang',
            shortName: 'Default',
            subtitle: 'Klasik bersih & terang — kontras tinggi siang hari',
            badge: 'Light',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#f3f5f9', '#ffffff', '#4f46e5', '#10b981'],
            chart: {
                plotBgTop: 'rgba(248, 250, 252, 0.55)',
                plotBgBottom: 'rgba(241, 245, 249, 0.35)',
                plotWatermark: null,
                plotCorners: null,
                gridColor: 'rgba(148, 163, 184, 0.24)',
                borderColor: 'rgba(148, 163, 184, 0.45)',
                tickColor: '#475569',
                tooltipBg: 'rgba(15, 23, 42, 0.94)',
                tooltipBorder: '#4f46e5',
                tooltipTitle: '#f8fafc',
                tooltipBody: '#e2e8f0',
                delayZoneBg: 'rgba(239, 68, 68, 0.09)',
                delayZoneHatch: 'rgba(239, 68, 68, 0.12)',
                delayDivider: '#ef4444',
                delayLabel: '#dc2626',
                donutCenterBg: '#ffffff',
                donutRingOuter: 'rgba(148, 163, 184, 0.38)',
                donutRingInner: 'rgba(148, 163, 184, 0.22)',
                donutRays: null,
                donutPctColor: '#0f172a',
                donutSubColor: '#64748b',
                trendLine: '#4f46e5',
                trendAreaTop: 'rgba(79, 70, 229, 0.24)',
                trendAreaBottom: 'rgba(79, 70, 229, 0.01)',
                trendRegression: '#f97316',
                barTrend: '#1e293b',
                pointBg: '#ffffff',
                pointBorder: '#4f46e5',
                sliceBorder: '#ffffff',
                sliceHoverBorder: '#1e293b',
                datalabelText: '#ffffff',
                datalabelBg: 'rgba(15, 23, 42, 0.72)',
                series: {
                    sched: { fill: '#3b82f6', border: '#2563eb' },
                    shOnsched: { fill: '#f59e0b', border: '#d97706' },
                    delay: { fill: '#ef4444', border: '#dc2626' },
                    shDelay: { fill: '#991b1b', border: '#7f1d1d' }
                },
                legendCaption: 'Biru = On-Sched • Oranye = Potensi SH • Merah = Delay • Marun = Delay SH'
            },
            export: {
                bg: '#f8fafc',
                border: '#cbd5e1',
                title: '#0f172a',
                subtitle: '#475569',
                thBg: '#f1f5f9',
                thText: '#334155',
                bodyText: '#0f172a',
                tableBg: '#ffffff',
                cellBorder: '#cbd5e1'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-600 hover:text-indigo-700 hover:bg-white border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-600 hover:text-purple-700 hover:bg-white border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-600 hover:text-pink-700 hover:bg-white border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-indigo-600 text-white shadow-sm border border-indigo-700 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-purple-600 text-white shadow-sm border border-purple-700 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-pink-600 text-white shadow-sm border border-pink-700 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-white bg-indigo-700 shadow-md border border-indigo-800 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-indigo-600 text-white shadow-sm border border-indigo-700 font-bold',
                catInactive: 'text-slate-600 hover:text-indigo-700 hover:bg-white border border-transparent',
                closedCard: 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-400 hover:bg-emerald-50',
                closedTitle: 'text-slate-900',
                closedSub: 'text-emerald-700',
                closedChip: 'bg-white border-emerald-200 text-slate-600',
                closedChipVal: 'text-slate-900',
                cnd3Card: 'bg-red-50/80 border-red-200 text-red-700 hover:border-red-400',
                cnd2Card: 'bg-amber-50/80 border-amber-200 text-amber-700 hover:border-amber-400',
                cndTitle: 'text-slate-900',
                shArrivedCard: 'bg-slate-50 border-slate-200 opacity-75 hover:opacity-100',
                shOpenCard: 'bg-amber-50 border-amber-300 hover:border-amber-500',
                shArrivedBadge: 'text-emerald-700 bg-emerald-100 border-emerald-300',
                shOpenBadge: 'text-red-700 bg-red-100 border-red-300',
                chartHeader: 'bg-slate-50 border-slate-200',
                chartTitle: 'text-slate-800',
                chartSub: 'text-slate-500',
                chartTotalBox: 'text-slate-600 border-slate-200 bg-white',
                chartTotalVal: 'text-indigo-700',
                chartDivider: 'bg-slate-200',
                chartLegendBox: 'bg-slate-50 border-slate-200 hover:border-indigo-300',
                legendSchedCard: 'text-blue-700 bg-blue-50 border-blue-200 hover:border-blue-400',
                legendSchedLabel: 'text-blue-600',
                legendSchedVal: 'text-blue-950',
                legendSchedSh: 'bg-amber-100 text-amber-800 border-amber-300',
                legendSchedPct: 'bg-white text-blue-700 border-blue-200',
                legendDelayCard: 'text-red-700 bg-red-50 border-red-200 hover:border-red-400',
                legendDelayLabel: 'text-red-600',
                legendDelayVal: 'text-red-950',
                legendDelaySh: 'bg-red-100 text-red-800 border-red-300',
                legendDelayPct: 'bg-white text-red-700 border-red-200',
                legendMeta: 'text-slate-500',
                matrixPctCell: 'text-indigo-800 bg-slate-50 border-slate-300',
                matrixDelayRemark: 'text-red-900 bg-red-100',
                matrixSchedRemark: 'text-blue-900 bg-blue-100',
                matrixPeriodCell: 'text-slate-600 bg-slate-50 border-slate-200',
                matrixWppCell: 'text-slate-900 bg-slate-100 border-slate-200',
                matrixOkLabel: 'text-blue-900 bg-blue-50 border-blue-200',
                matrixOkCell: 'text-slate-800 bg-white',
                matrixOkTotal: 'bg-blue-100 text-blue-950',
                matrixShLabel: 'text-red-900 bg-red-50 border-red-200',
                matrixShCell: 'text-red-700 bg-red-50/40',
                matrixShTotal: 'bg-red-200 text-red-950',
                matrixRiwLabel: 'text-amber-900 bg-amber-50 border-amber-200',
                matrixRiwCell: 'text-amber-800 bg-amber-50/40',
                matrixRiwTotal: 'bg-amber-200 text-amber-950',
                matrixFooterSched: 'text-emerald-800 bg-emerald-50',
                matrixFooterDelay: 'text-red-800 bg-red-50',
                matrixFooterPct: 'text-indigo-900 bg-indigo-50',
                matrixFooterPctVal: 'bg-indigo-100 text-indigo-950',
                matrixEmptyCell: 'bg-slate-50',
                recapWrap: 'bg-white border-slate-200',
                recapTh: 'bg-slate-100 text-slate-700 border-slate-200',
                recapRow: 'border-slate-200 hover:bg-slate-50',
                recapText: 'text-slate-800',
                recapMuted: 'text-slate-500'
            }
        },

        'royal-batik': {
            id: 'royal-batik',
            name: 'Royal Batik Sogan',
            shortName: 'Royal Batik',
            subtitle: 'Coklat sogan gelap & emas prada keraton + motif batik',
            badge: 'Batik',
            mode: 'dark',
            useBatikPatterns: true,
            showGunungan: true,
            swatches: ['#120a05', '#27170e', '#d4a843', '#96211e'],
            chart: {
                plotBgTop: 'rgba(32, 19, 11, 0.55)',
                plotBgBottom: 'rgba(18, 10, 5, 0.72)',
                plotWatermark: 'rgba(212, 168, 67, 0.065)',
                plotCorners: 'rgba(244, 212, 124, 0.42)',
                gridColor: 'rgba(212, 168, 67, 0.14)',
                borderColor: 'rgba(212, 168, 67, 0.32)',
                tickColor: '#d6be93',
                tooltipBg: 'rgba(23, 13, 7, 0.96)',
                tooltipBorder: '#d4a843',
                tooltipTitle: '#f4d47c',
                tooltipBody: '#f7ebd4',
                delayZoneBg: 'rgba(145, 28, 28, 0.24)',
                delayZoneHatch: 'rgba(229, 169, 68, 0.14)',
                delayDivider: '#e8be59',
                delayLabel: '#fda4af',
                donutCenterBg: '#190e07',
                donutRingOuter: 'rgba(244, 212, 124, 0.65)',
                donutRingInner: 'rgba(212, 168, 67, 0.35)',
                donutRays: 'rgba(244, 212, 124, 0.45)',
                donutPctColor: '#f4d47c',
                donutSubColor: '#cbb184',
                trendLine: '#f4d47c',
                trendAreaTop: 'rgba(212, 168, 67, 0.44)',
                trendAreaBottom: 'rgba(212, 168, 67, 0.02)',
                trendRegression: '#e07b47',
                barTrend: '#fce49c',
                pointBg: '#1a0e07',
                pointBorder: '#f7dc88',
                sliceBorder: '#170d07',
                sliceHoverBorder: '#f4d47c',
                datalabelText: '#fff8e1',
                datalabelBg: 'rgba(20, 11, 5, 0.70)',
                series: {
                    sched: { motif: 'kawung', base: '#b3811e', stroke: '#f8de93', accent: '#291608', border: 'rgba(248,222,147,0.75)' },
                    shOnsched: { motif: 'nitik', base: '#bd641a', stroke: '#fde293', accent: '#fff4cc', border: 'rgba(253,226,147,0.55)' },
                    delay: { motif: 'parang', base: '#96211e', stroke: '#eab354', accent: '#f8d77f', border: 'rgba(244,212,124,0.5)' },
                    shDelay: { motif: 'ceplok', base: '#541115', stroke: '#d99e3a', accent: '#f5d47a', border: 'rgba(217,158,58,0.55)' }
                },
                legendCaption: 'Motif Batik Kawung (Emas) = On-Sched • Nitik (Tembaga) = Potensi SH • Parang (Marun) = Delay • Ceplok = Delay SH'
            },
            export: {
                bg: '#140b06',
                border: '#d4a843',
                title: '#f4d47c',
                subtitle: '#cbb184',
                thBg: '#2c190d',
                thText: '#f4d47c',
                bodyText: '#f7ebd4',
                tableBg: '#1c1008',
                cellBorder: 'rgba(212,168,67,0.4)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d6be93] hover:text-[#f4d47c] border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d6be93] hover:text-[#dfb4ff] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d6be93] hover:text-[#f9a8d4] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#1a0e06] bg-gradient-to-r from-[#c9952a] via-[#f6d983] to-[#c9952a] border border-[#fff2bf]/70 shadow-md whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#3b1c54] shadow-sm text-[#dfb4ff] border border-[#c084fc]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#4e182e] shadow-sm text-[#f9a8d4] border border-[#f472b6]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#f4d47c] bg-[#2c1a0e] hover:bg-[#3d2514] border border-[#d4a843]/50 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#1a0e06] bg-gradient-to-r from-[#c7942a] via-[#f0cb6e] to-[#c7942a] hover:brightness-110 border border-[#fff2bf]/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#1a0e06] bg-gradient-to-r from-[#c9952a] via-[#f6d983] to-[#c9952a] shadow-md border border-[#fff2bf]/70 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#c7942a] via-[#f0cb6e] to-[#c7942a] text-[#1a0e06] shadow border border-[#fff2bf]/70 font-extrabold',
                catInactive: 'text-[#d6be93] hover:text-[#f4d47c] hover:bg-[#2c1a0e] border border-transparent',
                closedCard: 'border-[#34d399]/30 bg-[#14271c] hover:border-[#34d399]/70 hover:bg-[#193324]',
                closedTitle: 'text-[#f7ebd4]',
                closedSub: 'text-[#6ee7b7]',
                closedChip: 'bg-[#120a05]/80 border-[#d4a843]/25 text-[#cbb184]',
                closedChipVal: 'text-[#f7ebd4]',
                cnd3Card: 'bg-[#2d1312] border-[#ef4444]/40 text-[#fda4af] hover:border-[#f87171]',
                cnd2Card: 'bg-[#2e1e0d] border-[#f59e0b]/40 text-[#fcd34d] hover:border-[#fbbf24]',
                cndTitle: 'text-[#f7ebd4]',
                shArrivedCard: 'bg-[#1a1009] border-[#d4a843]/20 opacity-70 hover:opacity-100',
                shOpenCard: 'bg-[#2c1c0c] border-[#f4d47c]/40 hover:border-[#f4d47c]',
                shArrivedBadge: 'text-[#6ee7b7] bg-[#11422e] border-[#34d399]/40',
                shOpenBadge: 'text-[#fecdd3] bg-[#7f1d1d] border-[#f87171]/50',
                chartHeader: 'bg-[#1e1108] border-[#d4a843]/30',
                chartTitle: 'text-[#f4d47c]',
                chartSub: 'text-[#ab8f63]',
                chartTotalBox: 'text-[#cbb184] border-[#d4a843]/45 bg-[#150c06]',
                chartTotalVal: 'text-[#f4d47c]',
                chartDivider: 'bg-[#d4a843]/25',
                chartLegendBox: 'bg-[#170d07] border-[#d4a843]/35 hover:border-[#f4d47c]/70',
                legendSchedCard: 'text-[#f4d47c] bg-[#2a1c0b] border-[#d4a843]/45 hover:border-[#f4d47c] hover:bg-[#36230d]',
                legendSchedLabel: 'text-[#cbb184]',
                legendSchedVal: 'text-[#fff3c4]',
                legendSchedSh: 'bg-[#4d2c0f] text-[#fde08d] border-[#e09f3e]/50',
                legendSchedPct: 'bg-[#150c06] text-[#f4d47c] border-[#d4a843]/50',
                legendDelayCard: 'text-[#fda4af] bg-[#2d1312] border-[#ef4444]/45 hover:border-[#f87171] hover:bg-[#3d1917]',
                legendDelayLabel: 'text-[#e5a3a8]',
                legendDelayVal: 'text-[#ffe4e6]',
                legendDelaySh: 'bg-[#4c1518] text-[#fde08d] border-[#f87171]/45',
                legendDelayPct: 'bg-[#150c06] text-[#fda4af] border-[#ef4444]/50',
                legendMeta: 'text-[#ab8f63]',
                matrixPctCell: 'text-[#f4d47c] bg-[#1c1008] border-[#d4a843]/40',
                matrixDelayRemark: 'text-[#fecdd3] bg-[#4a1616]',
                matrixSchedRemark: 'text-[#fce49c] bg-[#3d280d]',
                matrixPeriodCell: 'text-[#d6be93] bg-[#1d1109] border-[#d4a843]/35',
                matrixWppCell: 'text-[#f4d47c] bg-[#28170c] border-[#d4a843]/35',
                matrixOkLabel: 'text-[#fce49c] bg-[#3f2a0f] border-[#d4a843]/45',
                matrixOkCell: 'text-[#f7ebd4] bg-[#2a1c0d]',
                matrixOkTotal: 'bg-[#4a3212] text-[#fff2bf]',
                matrixShLabel: 'text-[#fecdd3] bg-[#541717] border-[#ef4444]/45',
                matrixShCell: 'text-[#fda4af] bg-[#331313]',
                matrixShTotal: 'bg-[#691c1c] text-[#ffe4e6]',
                matrixRiwLabel: 'text-[#fde68a] bg-[#4c2e0e] border-[#f59e0b]/45',
                matrixRiwCell: 'text-[#fcd34d] bg-[#2e1d0b]',
                matrixRiwTotal: 'bg-[#633c11] text-[#fef3c7]',
                matrixFooterSched: 'text-[#6ee7b7] bg-[#13291e]',
                matrixFooterDelay: 'text-[#fda4af] bg-[#361313]',
                matrixFooterPct: 'text-[#f4d47c] bg-[#3a2510]',
                matrixFooterPctVal: 'bg-[#4f3414] text-[#fff3c4]',
                matrixEmptyCell: 'bg-[#1b1008]',
                recapWrap: 'bg-[#190e07] border-[#d4a843]/25',
                recapTh: 'bg-[#2c1a0e] text-[#f4d47c] border-[#d4a843]/30',
                recapRow: 'border-[#d4a843]/20 hover:bg-[#2d1c10]',
                recapText: 'text-[#f7ebd4]',
                recapMuted: 'text-[#cbb184]'
            }
        },

        'batik-ivory': {
            id: 'batik-ivory',
            name: 'Batik Keraton Pagi',
            shortName: 'Batik Pagi',
            subtitle: 'Krem gading hangat & coklat sogan — batik versi terang',
            badge: 'Batik Light',
            mode: 'light',
            useBatikPatterns: true,
            showGunungan: true,
            swatches: ['#f6efe0', '#fffdf7', '#8c5a12', '#9e2620'],
            chart: {
                plotBgTop: 'rgba(255, 251, 240, 0.72)',
                plotBgBottom: 'rgba(246, 236, 214, 0.55)',
                plotWatermark: 'rgba(140, 90, 24, 0.065)',
                plotCorners: 'rgba(166, 111, 25, 0.45)',
                gridColor: 'rgba(160, 114, 42, 0.16)',
                borderColor: 'rgba(160, 114, 42, 0.35)',
                tickColor: '#5c3c22',
                tooltipBg: 'rgba(42, 24, 11, 0.95)',
                tooltipBorder: '#d4a843',
                tooltipTitle: '#f5d882',
                tooltipBody: '#fff8e8',
                delayZoneBg: 'rgba(168, 36, 30, 0.11)',
                delayZoneHatch: 'rgba(168, 36, 30, 0.13)',
                delayDivider: '#b91c1c',
                delayLabel: '#991b1b',
                donutCenterBg: '#fffdf7',
                donutRingOuter: 'rgba(166, 111, 25, 0.55)',
                donutRingInner: 'rgba(166, 111, 25, 0.3)',
                donutRays: 'rgba(181, 129, 36, 0.35)',
                donutPctColor: '#4f2e10',
                donutSubColor: '#846243',
                trendLine: '#9a6614',
                trendAreaTop: 'rgba(181, 129, 36, 0.28)',
                trendAreaBottom: 'rgba(181, 129, 36, 0.02)',
                trendRegression: '#c2410c',
                barTrend: '#4f2e10',
                pointBg: '#fffdf7',
                pointBorder: '#9a6614',
                sliceBorder: '#fffdf7',
                sliceHoverBorder: '#5c330c',
                datalabelText: '#fffdf7',
                datalabelBg: 'rgba(42, 24, 11, 0.74)',
                series: {
                    sched: { motif: 'kawung', base: '#a67418', stroke: '#fce6a6', accent: '#3d2409', border: 'rgba(140,90,18,0.85)' },
                    shOnsched: { motif: 'nitik', base: '#c46418', stroke: '#fde4a3', accent: '#fff4d4', border: 'rgba(180,83,9,0.7)' },
                    delay: { motif: 'parang', base: '#a32220', stroke: '#f2c46d', accent: '#fae09e', border: 'rgba(153,27,27,0.75)' },
                    shDelay: { motif: 'ceplok', base: '#611418', stroke: '#e5b254', accent: '#fae09e', border: 'rgba(97,20,24,0.85)' }
                },
                legendCaption: 'Batik Kawung (Emas Sogan) = On-Sched • Nitik (Tembaga) = Potensi SH • Parang (Marun) = Delay • Ceplok = Delay SH'
            },
            export: {
                bg: '#f6efe0',
                border: '#b58124',
                title: '#4f2e10',
                subtitle: '#7a542e',
                thBg: '#efe2c8',
                thText: '#4f2e10',
                bodyText: '#2a180b',
                tableBg: '#fffdf7',
                cellBorder: 'rgba(160,114,42,0.38)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#6e4b2b] hover:text-[#3d2108] hover:bg-[#fffdf7] border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#6e4b2b] hover:text-purple-800 hover:bg-[#fffdf7] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#6e4b2b] hover:text-pink-800 hover:bg-[#fffdf7] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#fce7a8] bg-gradient-to-r from-[#5c3513] to-[#3f220a] border border-[#b58124] shadow-sm whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-purple-800 text-purple-50 shadow-sm border border-purple-900 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-pink-800 text-pink-50 shadow-sm border border-pink-900 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#5c330c] bg-[#fffdf7] hover:bg-[#f5e7c9] border border-[#b58124]/50 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fce7a8] bg-gradient-to-r from-[#6b3f16] to-[#47280d] hover:brightness-110 border border-[#b58124] flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#fce7a8] bg-gradient-to-r from-[#5c3513] to-[#3a1f09] shadow-md border border-[#d4a843] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#5c3513] text-[#fce7a8] shadow-sm border border-[#b58124] font-bold',
                catInactive: 'text-[#6e4b2b] hover:text-[#3d2108] hover:bg-[#fffdf7] border border-transparent',
                closedCard: 'border-emerald-300/70 bg-emerald-50/80 hover:border-emerald-500',
                closedTitle: 'text-[#2a180b]',
                closedSub: 'text-emerald-800',
                closedChip: 'bg-[#fffdf7] border-emerald-200 text-[#5c3c22]',
                closedChipVal: 'text-[#2a180b]',
                cnd3Card: 'bg-[#fceceb] border-red-300 text-red-800 hover:border-red-500',
                cnd2Card: 'bg-[#fef3dc] border-amber-300 text-amber-800 hover:border-amber-500',
                cndTitle: 'text-[#2a180b]',
                shArrivedCard: 'bg-[#f6efe0] border-[#b58124]/25 opacity-75 hover:opacity-100',
                shOpenCard: 'bg-[#fcf1d8] border-[#b58124]/50 hover:border-[#8c5a12]',
                shArrivedBadge: 'text-emerald-800 bg-emerald-100 border-emerald-300',
                shOpenBadge: 'text-red-800 bg-red-100 border-red-300',
                chartHeader: 'bg-[#faf2e1] border-[#b58124]/30',
                chartTitle: 'text-[#4f2e10]',
                chartSub: 'text-[#846243]',
                chartTotalBox: 'text-[#785430] border-[#b58124]/45 bg-[#fffdf7]',
                chartTotalVal: 'text-[#5c330c]',
                chartDivider: 'bg-[#b58124]/25',
                chartLegendBox: 'bg-[#faf2e1] border-[#b58124]/32 hover:border-[#8c5a12]',
                legendSchedCard: 'text-[#6e4514] bg-[#fcf3db] border-[#b58124]/45 hover:border-[#8c5a12]',
                legendSchedLabel: 'text-[#846243]',
                legendSchedVal: 'text-[#3d2108]',
                legendSchedSh: 'bg-[#f5dfa9] text-[#6e3b09] border-[#c48d2a]',
                legendSchedPct: 'bg-[#fffdf7] text-[#6e4514] border-[#b58124]/50',
                legendDelayCard: 'text-red-800 bg-[#fceceb] border-red-300 hover:border-red-500',
                legendDelayLabel: 'text-red-700',
                legendDelayVal: 'text-red-950',
                legendDelaySh: 'bg-red-100 text-red-900 border-red-300',
                legendDelayPct: 'bg-[#fffdf7] text-red-800 border-red-300',
                legendMeta: 'text-[#785430]',
                matrixPctCell: 'text-[#5c330c] bg-[#faf2e1] border-[#b58124]/40',
                matrixDelayRemark: 'text-red-900 bg-[#f8d7d5]',
                matrixSchedRemark: 'text-[#5c3905] bg-[#f5e3b8]',
                matrixPeriodCell: 'text-[#6e4b2b] bg-[#faf2e1] border-[#b58124]/30',
                matrixWppCell: 'text-[#4f2e10] bg-[#f3e5c7] border-[#b58124]/30',
                matrixOkLabel: 'text-[#5c3905] bg-[#f7e7c0] border-[#b58124]/40',
                matrixOkCell: 'text-[#2a180b] bg-[#fffdf7]',
                matrixOkTotal: 'bg-[#efd8a3] text-[#3d2108]',
                matrixShLabel: 'text-red-900 bg-[#fadbd9] border-red-300',
                matrixShCell: 'text-red-800 bg-[#fdf3f2]',
                matrixShTotal: 'bg-[#f4bdbc] text-red-950',
                matrixRiwLabel: 'text-amber-900 bg-[#fae7bf] border-amber-300',
                matrixRiwCell: 'text-amber-900 bg-[#fdf7ea]',
                matrixRiwTotal: 'bg-[#f2d08c] text-amber-950',
                matrixFooterSched: 'text-emerald-900 bg-[#e2f5ea]',
                matrixFooterDelay: 'text-red-900 bg-[#fbe4e3]',
                matrixFooterPct: 'text-[#5c330c] bg-[#f3e4c3]',
                matrixFooterPctVal: 'bg-[#e6cc95] text-[#3d2108]',
                matrixEmptyCell: 'bg-[#f6efe0]',
                recapWrap: 'bg-[#fffdf7] border-[#b58124]/30',
                recapTh: 'bg-[#f3e5c7] text-[#4f2e10] border-[#b58124]/35',
                recapRow: 'border-[#b58124]/22 hover:bg-[#faf2e1]',
                recapText: 'text-[#2a180b]',
                recapMuted: 'text-[#785430]'
            }
        },

        'industrial-dark': {
            id: 'industrial-dark',
            name: 'Industrial Dark Slate',
            shortName: 'Dark Slate',
            subtitle: 'Minimalis ruang kontrol pabrik — modern, tajam, fokus data',
            badge: 'Dark',
            mode: 'dark',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#0b1120', '#131c31', '#38bdf8', '#f43f5e'],
            chart: {
                plotBgTop: 'rgba(15, 23, 42, 0.55)',
                plotBgBottom: 'rgba(11, 17, 32, 0.72)',
                plotWatermark: null,
                plotCorners: null,
                gridColor: 'rgba(148, 163, 184, 0.14)',
                borderColor: 'rgba(148, 163, 184, 0.28)',
                tickColor: '#94a3b8',
                tooltipBg: 'rgba(15, 23, 42, 0.96)',
                tooltipBorder: '#38bdf8',
                tooltipTitle: '#7dd3fc',
                tooltipBody: '#f1f5f9',
                delayZoneBg: 'rgba(244, 63, 94, 0.16)',
                delayZoneHatch: 'rgba(244, 63, 94, 0.12)',
                delayDivider: '#fb7185',
                delayLabel: '#fda4af',
                donutCenterBg: '#0f172a',
                donutRingOuter: 'rgba(56, 189, 248, 0.55)',
                donutRingInner: 'rgba(148, 163, 184, 0.28)',
                donutRays: null,
                donutPctColor: '#7dd3fc',
                donutSubColor: '#94a3b8',
                trendLine: '#38bdf8',
                trendAreaTop: 'rgba(56, 189, 248, 0.34)',
                trendAreaBottom: 'rgba(56, 189, 248, 0.01)',
                trendRegression: '#f59e0b',
                barTrend: '#e0f2fe',
                pointBg: '#0b1120',
                pointBorder: '#38bdf8',
                sliceBorder: '#0f172a',
                sliceHoverBorder: '#7dd3fc',
                datalabelText: '#f8fafc',
                datalabelBg: 'rgba(11, 17, 32, 0.74)',
                series: {
                    sched: { fill: '#0ea5e9', border: '#38bdf8' },
                    shOnsched: { fill: '#f59e0b', border: '#fbbf24' },
                    delay: { fill: '#e11d48', border: '#fb7185' },
                    shDelay: { fill: '#881337', border: '#f43f5e' }
                },
                legendCaption: 'Cyan = On-Sched • Amber = Potensi SH • Crimson = Delay • Dark Rose = Delay SH'
            },
            export: {
                bg: '#0b1120',
                border: '#38bdf8',
                title: '#7dd3fc',
                subtitle: '#94a3b8',
                thBg: '#1e293b',
                thText: '#93c5fd',
                bodyText: '#f1f5f9',
                tableBg: '#131c31',
                cellBorder: 'rgba(148,163,184,0.3)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-300 hover:text-sky-300 border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-300 hover:text-purple-300 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-slate-300 hover:text-pink-300 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-slate-950 bg-sky-400 border border-sky-300 shadow-md whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-purple-900/90 text-purple-200 border border-purple-400/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-pink-900/90 text-pink-200 border border-pink-400/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-sky-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:brightness-110 border border-sky-400/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-slate-950 bg-sky-400 shadow-md border border-sky-200 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-sky-400 text-slate-950 shadow border border-sky-200 font-extrabold',
                catInactive: 'text-slate-300 hover:text-sky-300 hover:bg-slate-800 border border-transparent',
                closedCard: 'border-emerald-500/35 bg-emerald-950/60 hover:border-emerald-400',
                closedTitle: 'text-slate-100',
                closedSub: 'text-emerald-300',
                closedChip: 'bg-slate-950/80 border-slate-700 text-slate-300',
                closedChipVal: 'text-slate-100',
                cnd3Card: 'bg-rose-950/70 border-rose-500/40 text-rose-300 hover:border-rose-400',
                cnd2Card: 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:border-amber-400',
                cndTitle: 'text-slate-100',
                shArrivedCard: 'bg-slate-900 border-slate-700/60 opacity-70 hover:opacity-100',
                shOpenCard: 'bg-amber-950/50 border-amber-500/45 hover:border-amber-400',
                shArrivedBadge: 'text-emerald-300 bg-emerald-950 border-emerald-500/40',
                shOpenBadge: 'text-rose-200 bg-rose-900 border-rose-400/50',
                chartHeader: 'bg-slate-900/90 border-slate-700/70',
                chartTitle: 'text-sky-300',
                chartSub: 'text-slate-400',
                chartTotalBox: 'text-slate-300 border-slate-700 bg-slate-950',
                chartTotalVal: 'text-sky-300',
                chartDivider: 'bg-slate-700/60',
                chartLegendBox: 'bg-slate-950/80 border-slate-700/70 hover:border-sky-400/60',
                legendSchedCard: 'text-sky-300 bg-sky-950/70 border-sky-500/40 hover:border-sky-400',
                legendSchedLabel: 'text-sky-300',
                legendSchedVal: 'text-sky-50',
                legendSchedSh: 'bg-amber-950 text-amber-300 border-amber-500/45',
                legendSchedPct: 'bg-slate-950 text-sky-300 border-sky-500/45',
                legendDelayCard: 'text-rose-300 bg-rose-950/70 border-rose-500/40 hover:border-rose-400',
                legendDelayLabel: 'text-rose-300',
                legendDelayVal: 'text-rose-50',
                legendDelaySh: 'bg-rose-900/80 text-amber-200 border-rose-400/45',
                legendDelayPct: 'bg-slate-950 text-rose-300 border-rose-500/45',
                legendMeta: 'text-slate-400',
                matrixPctCell: 'text-sky-300 bg-slate-950 border-slate-700',
                matrixDelayRemark: 'text-rose-200 bg-rose-950',
                matrixSchedRemark: 'text-sky-200 bg-sky-950',
                matrixPeriodCell: 'text-slate-300 bg-slate-900 border-slate-700',
                matrixWppCell: 'text-sky-300 bg-slate-800 border-slate-700',
                matrixOkLabel: 'text-sky-200 bg-sky-950 border-sky-700',
                matrixOkCell: 'text-slate-100 bg-slate-900/90',
                matrixOkTotal: 'bg-sky-900 text-sky-100',
                matrixShLabel: 'text-rose-200 bg-rose-950 border-rose-700',
                matrixShCell: 'text-rose-300 bg-rose-950/50',
                matrixShTotal: 'bg-rose-900 text-rose-100',
                matrixRiwLabel: 'text-amber-200 bg-amber-950 border-amber-700',
                matrixRiwCell: 'text-amber-300 bg-amber-950/40',
                matrixRiwTotal: 'bg-amber-900 text-amber-100',
                matrixFooterSched: 'text-emerald-300 bg-emerald-950/70',
                matrixFooterDelay: 'text-rose-300 bg-rose-950/70',
                matrixFooterPct: 'text-sky-300 bg-sky-950/70',
                matrixFooterPctVal: 'bg-sky-900 text-sky-100',
                matrixEmptyCell: 'bg-slate-950',
                recapWrap: 'bg-slate-950 border-slate-800',
                recapTh: 'bg-slate-800 text-sky-300 border-slate-700',
                recapRow: 'border-slate-800 hover:bg-slate-800/60',
                recapText: 'text-slate-100',
                recapMuted: 'text-slate-400'
            }
        },

        'emerald-nusantara': {
            id: 'emerald-nusantara',
            name: 'Nusantara Zamrud',
            shortName: 'Zamrud',
            subtitle: 'Hijau zamrud gelap & emas sampanye — adem untuk shift panjang',
            badge: 'Batik Dark',
            mode: 'dark',
            useBatikPatterns: true,
            showGunungan: true,
            swatches: ['#071612', '#112a21', '#e6c35c', '#10b981'],
            chart: {
                plotBgTop: 'rgba(14, 38, 30, 0.58)',
                plotBgBottom: 'rgba(7, 22, 18, 0.74)',
                plotWatermark: 'rgba(230, 195, 92, 0.06)',
                plotCorners: 'rgba(244, 216, 124, 0.38)',
                gridColor: 'rgba(230, 195, 92, 0.13)',
                borderColor: 'rgba(230, 195, 92, 0.28)',
                tickColor: '#b7d7c8',
                tooltipBg: 'rgba(7, 22, 18, 0.96)',
                tooltipBorder: '#e6c35c',
                tooltipTitle: '#f4d87c',
                tooltipBody: '#ecf7f1',
                delayZoneBg: 'rgba(153, 27, 27, 0.24)',
                delayZoneHatch: 'rgba(230, 195, 92, 0.13)',
                delayDivider: '#e6c35c',
                delayLabel: '#fda4af',
                donutCenterBg: '#091b15',
                donutRingOuter: 'rgba(244, 216, 124, 0.6)',
                donutRingInner: 'rgba(52, 211, 153, 0.35)',
                donutRays: 'rgba(244, 216, 124, 0.4)',
                donutPctColor: '#f4d87c',
                donutSubColor: '#9cc4b3',
                trendLine: '#34d399',
                trendAreaTop: 'rgba(52, 211, 153, 0.36)',
                trendAreaBottom: 'rgba(52, 211, 153, 0.02)',
                trendRegression: '#f4d87c',
                barTrend: '#f4d87c',
                pointBg: '#071612',
                pointBorder: '#6ee7b7',
                sliceBorder: '#091b15',
                sliceHoverBorder: '#f4d87c',
                datalabelText: '#f4fff9',
                datalabelBg: 'rgba(7, 22, 18, 0.72)',
                series: {
                    sched: { motif: 'kawung', base: '#127a57', stroke: '#f4d87c', accent: '#07241a', border: 'rgba(110,231,183,0.7)' },
                    shOnsched: { motif: 'nitik', base: '#b8831e', stroke: '#fef0b8', accent: '#fff8db', border: 'rgba(244,216,124,0.6)' },
                    delay: { motif: 'parang', base: '#962228', stroke: '#eab85c', accent: '#fae09e', border: 'rgba(244,216,124,0.5)' },
                    shDelay: { motif: 'ceplok', base: '#541218', stroke: '#d9a441', accent: '#f5d47a', border: 'rgba(217,164,65,0.55)' }
                },
                legendCaption: 'Batik Kawung (Zamrud) = On-Sched • Nitik (Emas) = Potensi SH • Parang (Marun) = Delay • Ceplok = Delay SH'
            },
            export: {
                bg: '#071612',
                border: '#dfb74c',
                title: '#f4d87c',
                subtitle: '#9cc4b3',
                thBg: '#15382c',
                thText: '#f4d87c',
                bodyText: '#ecf7f1',
                tableBg: '#0e241d',
                cellBorder: 'rgba(230,195,92,0.34)'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#b7d7c8] hover:text-[#f4d87c] border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#b7d7c8] hover:text-[#dfb4ff] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#b7d7c8] hover:text-[#f9a8d4] border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#071913] bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] border border-[#fff2bf]/70 shadow-md whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#3b1c54] text-[#dfb4ff] border border-[#c084fc]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-[#4e182e] text-[#f9a8d4] border border-[#f472b6]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#f4d87c] bg-[#133127] hover:bg-[#1a4335] border border-[#e6c35c]/45 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#071913] bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] hover:brightness-110 border border-[#fff2bf]/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-extrabold transition text-[#071913] bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] shadow-md border border-[#fff2bf]/70 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#c79a2e] via-[#f2d478] to-[#c79a2e] text-[#071913] shadow border border-[#fff2bf]/70 font-extrabold',
                catInactive: 'text-[#b7d7c8] hover:text-[#f4d87c] hover:bg-[#133127] border border-transparent',
                closedCard: 'border-[#34d399]/35 bg-[#0e2d22] hover:border-[#34d399]/75',
                closedTitle: 'text-[#ecf7f1]',
                closedSub: 'text-[#6ee7b7]',
                closedChip: 'bg-[#071612]/80 border-[#e6c35c]/25 text-[#9cc4b3]',
                closedChipVal: 'text-[#ecf7f1]',
                cnd3Card: 'bg-[#281418] border-[#ef4444]/40 text-[#fda4af] hover:border-[#f87171]',
                cnd2Card: 'bg-[#262110] border-[#f59e0b]/40 text-[#fcd34d] hover:border-[#fbbf24]',
                cndTitle: 'text-[#ecf7f1]',
                shArrivedCard: 'bg-[#0b1f19] border-[#e6c35c]/20 opacity-70 hover:opacity-100',
                shOpenCard: 'bg-[#242110] border-[#f4d87c]/40 hover:border-[#f4d87c]',
                shArrivedBadge: 'text-[#6ee7b7] bg-[#0f4c36] border-[#34d399]/40',
                shOpenBadge: 'text-[#fecdd3] bg-[#7f1d1d] border-[#f87171]/50',
                chartHeader: 'bg-[#0d241c] border-[#e6c35c]/28',
                chartTitle: 'text-[#f4d87c]',
                chartSub: 'text-[#7da695]',
                chartTotalBox: 'text-[#9cc4b3] border-[#e6c35c]/40 bg-[#071612]',
                chartTotalVal: 'text-[#f4d87c]',
                chartDivider: 'bg-[#e6c35c]/22',
                chartLegendBox: 'bg-[#091a14] border-[#e6c35c]/30 hover:border-[#f4d87c]/65',
                legendSchedCard: 'text-[#6ee7b7] bg-[#0e2e23] border-[#34d399]/40 hover:border-[#6ee7b7]',
                legendSchedLabel: 'text-[#9cc4b3]',
                legendSchedVal: 'text-[#ecfdf5]',
                legendSchedSh: 'bg-[#3d300d] text-[#fde08d] border-[#e6c35c]/45',
                legendSchedPct: 'bg-[#071612] text-[#f4d87c] border-[#e6c35c]/45',
                legendDelayCard: 'text-[#fda4af] bg-[#281418] border-[#ef4444]/42 hover:border-[#f87171]',
                legendDelayLabel: 'text-[#e5a3a8]',
                legendDelayVal: 'text-[#ffe4e6]',
                legendDelaySh: 'bg-[#4c1518] text-[#fde08d] border-[#f87171]/45',
                legendDelayPct: 'bg-[#071612] text-[#fda4af] border-[#ef4444]/45',
                legendMeta: 'text-[#7da695]',
                matrixPctCell: 'text-[#f4d87c] bg-[#0a1c16] border-[#e6c35c]/35',
                matrixDelayRemark: 'text-[#fecdd3] bg-[#4a1618]',
                matrixSchedRemark: 'text-[#d1fae5] bg-[#10402f]',
                matrixPeriodCell: 'text-[#b7d7c8] bg-[#0d231b] border-[#e6c35c]/28',
                matrixWppCell: 'text-[#f4d87c] bg-[#123026] border-[#e6c35c]/28',
                matrixOkLabel: 'text-[#d1fae5] bg-[#123d2e] border-[#34d399]/40',
                matrixOkCell: 'text-[#ecf7f1] bg-[#0e2920]',
                matrixOkTotal: 'bg-[#16523d] text-[#ecfdf5]',
                matrixShLabel: 'text-[#fecdd3] bg-[#54171a] border-[#ef4444]/45',
                matrixShCell: 'text-[#fda4af] bg-[#331315]',
                matrixShTotal: 'bg-[#691c20] text-[#ffe4e6]',
                matrixRiwLabel: 'text-[#fde68a] bg-[#45340f] border-[#f59e0b]/45',
                matrixRiwCell: 'text-[#fcd34d] bg-[#2a210c]',
                matrixRiwTotal: 'bg-[#5c4514] text-[#fef3c7]',
                matrixFooterSched: 'text-[#6ee7b7] bg-[#0f3024]',
                matrixFooterDelay: 'text-[#fda4af] bg-[#361316]',
                matrixFooterPct: 'text-[#f4d87c] bg-[#15382c]',
                matrixFooterPctVal: 'bg-[#205442] text-[#fff3c4]',
                matrixEmptyCell: 'bg-[#0a1c16]',
                recapWrap: 'bg-[#091a14] border-[#e6c35c]/25',
                recapTh: 'bg-[#143429] text-[#f4d87c] border-[#e6c35c]/30',
                recapRow: 'border-[#e6c35c]/18 hover:bg-[#133127]',
                recapText: 'text-[#ecf7f1]',
                recapMuted: 'text-[#9cc4b3]'
            }
        },

        'macos-glass': {
            id: 'macos-glass',
            name: 'macOS Liquid Glass',
            shortName: 'macOS Glass',
            subtitle: 'Minimalis modern, kaca transparan buram ala macOS terbaru',
            badge: 'Glass',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#eef3fb', '#ffffff', '#007aff', '#af52de'],
            chart: {
                plotBgTop: 'rgba(255, 255, 255, 0.55)',
                plotBgBottom: 'rgba(238, 243, 251, 0.35)',
                plotWatermark: null,
                plotCorners: null,
                gridColor: 'rgba(148, 163, 184, 0.22)',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                tickColor: '#475569',
                tooltipBg: 'rgba(15, 23, 42, 0.88)',
                tooltipBorder: 'rgba(255, 255, 255, 0.35)',
                tooltipTitle: '#ffffff',
                tooltipBody: '#e2e8f0',
                delayZoneBg: 'rgba(255, 59, 48, 0.08)',
                delayZoneHatch: 'rgba(255, 59, 48, 0.10)',
                delayDivider: '#ff3b30',
                delayLabel: '#dc2626',
                donutCenterBg: 'rgba(255, 255, 255, 0.85)',
                donutRingOuter: 'rgba(0, 122, 255, 0.28)',
                donutRingInner: 'rgba(148, 163, 184, 0.20)',
                donutRays: null,
                donutPctColor: '#0f172a',
                donutSubColor: '#64748b',
                trendLine: '#007aff',
                trendAreaTop: 'rgba(0, 122, 255, 0.24)',
                trendAreaBottom: 'rgba(0, 122, 255, 0.01)',
                trendRegression: '#af52de',
                barTrend: '#1e293b',
                pointBg: '#ffffff',
                pointBorder: '#007aff',
                sliceBorder: 'rgba(255, 255, 255, 0.92)',
                sliceHoverBorder: '#007aff',
                datalabelText: '#ffffff',
                datalabelBg: 'rgba(15, 23, 42, 0.68)',
                series: {
                    sched: { fill: '#007aff', border: '#0062cc' },
                    shOnsched: { fill: '#ff9500', border: '#e08600' },
                    delay: { fill: '#ff3b30', border: '#d92d20' },
                    shDelay: { fill: '#b42318', border: '#912018' }
                },
                legendCaption: 'Biru = On-Sched • Oranye = Potensi SH • Merah = Delay • Marun = Delay SH'
            },
            export: {
                bg: '#eef3fb',
                border: '#cbd5e1',
                title: '#0f172a',
                subtitle: '#475569',
                thBg: '#e8effa',
                thText: '#334155',
                bodyText: '#0f172a',
                tableBg: '#ffffff',
                cellBorder: '#cbd5e1'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-full text-xs font-semibold transition text-slate-600 hover:text-[#007aff] hover:bg-white/80 border border-transparent whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-full text-xs font-semibold transition text-slate-600 hover:text-purple-700 hover:bg-white/80 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-full text-xs font-semibold transition text-slate-600 hover:text-pink-700 hover:bg-white/80 border border-transparent flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-full text-xs font-bold transition bg-[#007aff] text-white shadow-sm border border-white/50 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-full text-xs font-bold transition bg-[#af52de] text-white shadow-sm border border-white/50 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-full text-xs font-bold transition bg-[#ff2d55] text-white shadow-sm border border-white/50 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-full text-xs font-bold transition text-slate-700 bg-white/75 hover:bg-white border border-white/90 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-full text-xs font-bold transition text-white bg-[#007aff] hover:bg-[#0066d6] border border-white/40 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-full text-xs font-extrabold transition text-white bg-[#005bb5] shadow-md border border-white/50 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#007aff] text-white shadow-sm border border-white/45 font-bold rounded-full',
                catInactive: 'text-slate-600 hover:text-[#007aff] hover:bg-white/80 border border-transparent rounded-full',
                closedCard: 'border-emerald-200/80 bg-white/65 hover:border-emerald-400 hover:bg-white/90',
                closedTitle: 'text-slate-900',
                closedSub: 'text-emerald-700',
                closedChip: 'bg-white/80 border-slate-200/80 text-slate-600',
                closedChipVal: 'text-slate-900',
                cnd3Card: 'bg-red-50/75 border-red-200/80 text-red-700 hover:border-red-400',
                cnd2Card: 'bg-amber-50/75 border-amber-200/80 text-amber-700 hover:border-amber-400',
                cndTitle: 'text-slate-900',
                shArrivedCard: 'bg-white/50 border-slate-200/70 opacity-75 hover:opacity-100',
                shOpenCard: 'bg-amber-50/75 border-amber-300/80 hover:border-amber-500',
                shArrivedBadge: 'text-emerald-700 bg-emerald-100/80 border-emerald-300',
                shOpenBadge: 'text-red-700 bg-red-100/80 border-red-300',
                chartHeader: 'bg-white/50 border-white/80',
                chartTitle: 'text-slate-900',
                chartSub: 'text-slate-500',
                chartTotalBox: 'text-slate-600 border-white/90 bg-white/70',
                chartTotalVal: 'text-[#007aff]',
                chartDivider: 'bg-slate-300/50',
                chartLegendBox: 'bg-white/50 border-white/80 hover:border-[#007aff]/40',
                legendSchedCard: 'text-[#007aff] bg-blue-50/70 border-blue-200/80 hover:border-[#007aff]',
                legendSchedLabel: 'text-[#007aff]',
                legendSchedVal: 'text-slate-950',
                legendSchedSh: 'bg-amber-100/85 text-amber-800 border-amber-300',
                legendSchedPct: 'bg-white/90 text-[#007aff] border-blue-200',
                legendDelayCard: 'text-red-700 bg-red-50/70 border-red-200/80 hover:border-red-400',
                legendDelayLabel: 'text-red-600',
                legendDelayVal: 'text-red-950',
                legendDelaySh: 'bg-red-100/85 text-red-800 border-red-300',
                legendDelayPct: 'bg-white/90 text-red-700 border-red-200',
                legendMeta: 'text-slate-500',
                matrixPctCell: 'text-[#0051a8] bg-white/75 border-slate-300/70',
                matrixDelayRemark: 'text-red-900 bg-red-100/80',
                matrixSchedRemark: 'text-blue-900 bg-blue-100/80',
                matrixPeriodCell: 'text-slate-600 bg-white/70 border-slate-200/80',
                matrixWppCell: 'text-slate-900 bg-slate-100/80 border-slate-200/80',
                matrixOkLabel: 'text-blue-900 bg-blue-50/80 border-blue-200',
                matrixOkCell: 'text-slate-800 bg-white/80',
                matrixOkTotal: 'bg-blue-100/85 text-blue-950',
                matrixShLabel: 'text-red-900 bg-red-50/80 border-red-200',
                matrixShCell: 'text-red-700 bg-red-50/40',
                matrixShTotal: 'bg-red-200/80 text-red-950',
                matrixRiwLabel: 'text-amber-900 bg-amber-50/80 border-amber-200',
                matrixRiwCell: 'text-amber-800 bg-amber-50/40',
                matrixRiwTotal: 'bg-amber-200/80 text-amber-950',
                matrixFooterSched: 'text-emerald-800 bg-emerald-50/80',
                matrixFooterDelay: 'text-red-800 bg-red-50/80',
                matrixFooterPct: 'text-[#0051a8] bg-blue-50/85',
                matrixFooterPctVal: 'bg-blue-100/90 text-[#004085]',
                matrixEmptyCell: 'bg-white/50',
                recapWrap: 'bg-white/70 border-white/85',
                recapTh: 'bg-slate-100/80 text-slate-700 border-slate-200/80',
                recapRow: 'border-slate-200/70 hover:bg-white/85',
                recapText: 'text-slate-900',
                recapMuted: 'text-slate-500'
            }
        },

        'windows-98': {
            id: 'windows-98',
            name: 'Windows 98 Classic',
            shortName: 'Win98',
            subtitle: 'Retro autentik 1998 — desktop teal, tombol 3D bevel, titlebar biru',
            badge: 'Retro',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#008080', '#c0c0c0', '#000080', '#1084d0'],
            chart: {
                plotBgTop: '#ffffff',
                plotBgBottom: '#ffffff',
                plotWatermark: null,
                plotCorners: null,
                gridColor: '#c0c0c0',
                borderColor: '#808080',
                tickColor: '#000000',
                tooltipBg: '#ffffe1',
                tooltipBorder: '#000000',
                tooltipTitle: '#000080',
                tooltipBody: '#000000',
                delayZoneBg: 'rgba(128, 0, 0, 0.10)',
                delayZoneHatch: 'rgba(128, 0, 0, 0.14)',
                delayDivider: '#800000',
                delayLabel: '#800000',
                donutCenterBg: '#ffffff',
                donutRingOuter: '#808080',
                donutRingInner: '#c0c0c0',
                donutRays: null,
                donutPctColor: '#000080',
                donutSubColor: '#404040',
                trendLine: '#000080',
                trendAreaTop: 'rgba(0, 0, 128, 0.22)',
                trendAreaBottom: 'rgba(0, 0, 128, 0.02)',
                trendRegression: '#800000',
                barTrend: '#000000',
                pointBg: '#ffffff',
                pointBorder: '#000080',
                sliceBorder: '#000000',
                sliceHoverBorder: '#000080',
                datalabelText: '#ffffff',
                datalabelBg: '#000080',
                series: {
                    sched: { fill: '#000080', border: '#000000' },
                    shOnsched: { fill: '#808000', border: '#000000' },
                    delay: { fill: '#c00000', border: '#000000' },
                    shDelay: { fill: '#800000', border: '#000000' }
                },
                legendCaption: 'Navy = On-Sched • Olive = Potensi SH • Merah = Delay • Marun = Delay SH'
            },
            export: {
                bg: '#c0c0c0',
                border: '#000000',
                title: '#000080',
                subtitle: '#000000',
                thBg: '#c0c0c0',
                thText: '#000000',
                bodyText: '#000000',
                tableBg: '#ffffff',
                cellBorder: '#808080'
            },
            ui: {
                navInactive: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 text-xs font-bold transition bg-[#000080] text-white border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 text-xs font-bold transition bg-[#800080] text-white border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 text-xs font-bold transition bg-[#800000] text-white border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 text-xs font-bold transition text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-black shadow-[inset_1.5px_1.5px_0_#fff,inset_-1.5px_-1.5px_0_#808080] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 text-xs font-bold transition text-white bg-[#000080] border border-black shadow-[inset_1.5px_1.5px_0_#808080,inset_-1.5px_-1.5px_0_#fff] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#000080] text-white border border-black font-bold',
                catInactive: 'text-black bg-[#c0c0c0] hover:bg-[#d4d0c8] border border-[#808080]',
                closedCard: 'border-[#808080] bg-white hover:bg-[#f0fff0]',
                closedTitle: 'text-black',
                closedSub: 'text-[#006600]',
                closedChip: 'bg-[#dfdfdf] border-[#808080] text-black',
                closedChipVal: 'text-black',
                cnd3Card: 'bg-[#fff0f0] border-[#800000] text-[#800000]',
                cnd2Card: 'bg-[#ffffe1] border-[#808000] text-[#804000]',
                cndTitle: 'text-black',
                shArrivedCard: 'bg-[#dfdfdf] border-[#808080] opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#ffffe1] border-[#808000]',
                shArrivedBadge: 'text-white bg-[#008000] border-black',
                shOpenBadge: 'text-white bg-[#800000] border-black',
                chartHeader: 'bg-gradient-to-r from-[#000080] to-[#1084d0] border-black',
                chartTitle: 'text-white',
                chartSub: 'text-[#e2e8f0]',
                chartTotalBox: 'text-black border-black bg-[#c0c0c0]',
                chartTotalVal: 'text-[#000080]',
                chartDivider: 'bg-[#808080]',
                chartLegendBox: 'bg-white border-[#808080]',
                legendSchedCard: 'text-[#000080] bg-[#e8eef7] border-[#000080]',
                legendSchedLabel: 'text-[#000080]',
                legendSchedVal: 'text-black',
                legendSchedSh: 'bg-[#ffffe1] text-[#804000] border-[#808000]',
                legendSchedPct: 'bg-white text-[#000080] border-[#808080]',
                legendDelayCard: 'text-[#800000] bg-[#fff0f0] border-[#800000]',
                legendDelayLabel: 'text-[#800000]',
                legendDelayVal: 'text-black',
                legendDelaySh: 'bg-[#ffdada] text-[#800000] border-[#800000]',
                legendDelayPct: 'bg-white text-[#800000] border-[#808080]',
                legendMeta: 'text-black',
                matrixPctCell: 'text-[#000080] bg-[#dfdfdf] border-[#808080]',
                matrixDelayRemark: 'text-white bg-[#800000]',
                matrixSchedRemark: 'text-white bg-[#000080]',
                matrixPeriodCell: 'text-black bg-[#dfdfdf] border-[#808080]',
                matrixWppCell: 'text-[#000080] bg-[#c0c0c0] border-[#808080]',
                matrixOkLabel: 'text-[#000080] bg-[#d9e6f6] border-[#808080]',
                matrixOkCell: 'text-black bg-white',
                matrixOkTotal: 'bg-[#c0d6f0] text-black',
                matrixShLabel: 'text-[#800000] bg-[#f6d9d9] border-[#808080]',
                matrixShCell: 'text-[#800000] bg-[#fff5f5]',
                matrixShTotal: 'bg-[#f0bcbc] text-black',
                matrixRiwLabel: 'text-[#804000] bg-[#ffffe1] border-[#808080]',
                matrixRiwCell: 'text-[#804000] bg-[#fffff2]',
                matrixRiwTotal: 'bg-[#f0e6a8] text-black',
                matrixFooterSched: 'text-[#006600] bg-[#e2f5e2]',
                matrixFooterDelay: 'text-[#800000] bg-[#fbe4e4]',
                matrixFooterPct: 'text-[#000080] bg-[#d9e6f6]',
                matrixFooterPctVal: 'bg-[#000080] text-white',
                matrixEmptyCell: 'bg-[#efefef]',
                recapWrap: 'bg-white border-[#808080]',
                recapTh: 'bg-[#c0c0c0] text-black border-[#808080]',
                recapRow: 'border-[#c0c0c0] hover:bg-[#e8eef7]',
                recapText: 'text-black',
                recapMuted: 'text-[#404040]'
            }
        },

        'imperial-japan': {
            id: 'imperial-japan',
            name: 'Imperial Kyoto',
            shortName: 'Kyoto',
            subtitle: 'Royal Jepang — merah marun lacquer, emas & krim washi beraksen Kumo/Uzumaki',
            badge: 'Royal JP',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#6b101d', '#d4a644', '#faf3e4', '#8a1c26'],
            chart: {
                plotBgTop: 'rgba(255, 252, 244, 0.92)',
                plotBgBottom: 'rgba(247, 236, 214, 0.78)',
                plotWatermark: 'rgba(197, 147, 46, 0.14)',
                plotWatermarkStyle: 'uzumaki',
                plotCorners: 'rgba(197, 147, 46, 0.65)',
                gridColor: 'rgba(138, 28, 38, 0.10)',
                borderColor: 'rgba(197, 147, 46, 0.52)',
                tickColor: '#5c232b',
                tooltipBg: 'rgba(67, 7, 16, 0.96)',
                tooltipBorder: '#d4a644',
                tooltipTitle: '#fae19c',
                tooltipBody: '#fff8e7',
                delayZoneBg: 'rgba(138, 28, 38, 0.11)',
                delayZoneHatch: 'rgba(197, 147, 46, 0.18)',
                delayDivider: '#8a1c26',
                delayLabel: '#7a1220',
                donutCenterBg: '#fffdf7',
                donutRingOuter: 'rgba(197, 147, 46, 0.78)',
                donutRingInner: 'rgba(138, 28, 38, 0.35)',
                donutRays: 'rgba(197, 147, 46, 0.45)',
                donutPctColor: '#6b101d',
                donutSubColor: '#8a5a4e',
                trendLine: '#8a1c26',
                trendAreaTop: 'rgba(197, 147, 46, 0.30)',
                trendAreaBottom: 'rgba(250, 243, 228, 0.02)',
                trendRegression: '#c5932e',
                barTrend: '#540914',
                pointBg: '#fffdf7',
                pointBorder: '#8a1c26',
                sliceBorder: '#fffdf7',
                sliceHoverBorder: '#d4a644',
                datalabelText: '#fff8e7',
                datalabelBg: 'rgba(99, 12, 24, 0.88)',
                series: {
                    sched: { fill: '#c5932e', border: '#9c7019' },
                    shOnsched: { fill: '#d97706', border: '#a85704' },
                    delay: { fill: '#8a1c26', border: '#5c0b17' },
                    shDelay: { fill: '#4e0812', border: '#2e040a' }
                },
                legendCaption: 'Emas = On-Sched • Amber = Potensi SH • Marun = Delay • Lacquer Gelap = Delay SH'
            },
            export: {
                bg: '#faf3e4',
                border: '#c5932e',
                title: '#6b101d',
                subtitle: '#7e5247',
                thBg: '#6b101d',
                thText: '#fae19c',
                bodyText: '#2d0c11',
                tableBg: '#fffdf7',
                cellBorder: '#e2cca3'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#f5e3be] hover:text-[#fffdf7] hover:bg-[#8a1c26]/45 whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#f8d7de] hover:text-[#fffdf7] hover:bg-[#8a1c26]/45 flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fae19c] hover:text-[#fffdf7] hover:bg-[#8a1c26]/45 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#e0b85c] to-[#b98521] text-[#3a050c] shadow-md border border-[#fff0bd]/70 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#9c1d37] to-[#680f23] text-[#fff8e7] shadow-md border border-[#e0b85c]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#b4232c] to-[#74101a] text-[#fae19c] shadow-md border border-[#f5d882]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fae19c] bg-[#440710]/85 hover:bg-[#6b101d] border border-[#d4a644]/55 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#3a050c] bg-gradient-to-r from-[#e5be63] to-[#c9962f] hover:from-[#f2d07b] hover:to-[#d9a63c] border border-[#fff0bd]/70 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fff8e7] bg-[#8a1c26] border border-[#f5d882] flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#8a1c26] to-[#630c18] text-[#fff8e7] border border-[#d4a644] shadow-sm font-bold',
                catInactive: 'text-[#6b101d] hover:text-[#3d0b12] hover:bg-[#fffdf7] border border-transparent',
                closedCard: 'border-[#246346]/25 bg-[#f7faf7] hover:bg-[#ecf5ee]',
                closedTitle: 'text-[#1b4733]',
                closedSub: 'text-[#2d6a4f]',
                closedChip: 'bg-[#fffdf7] border-[#c5932e]/35 text-[#5c232b]',
                closedChipVal: 'text-[#2d0c11]',
                cnd3Card: 'bg-[#fdf1f0] border-[#8a1c26]/35 text-[#7a1220]',
                cnd2Card: 'bg-[#fcf5e4] border-[#c5932e]/45 text-[#8c5a0d]',
                cndTitle: 'text-[#3d0b12]',
                shArrivedCard: 'bg-[#f6efe1] border-[#c5932e]/35 opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#fcf3df] border-[#c5932e]/60',
                shArrivedBadge: 'text-[#1e573b] bg-[#e6f3ec] border-[#246346]/35',
                shOpenBadge: 'text-[#fff8e7] bg-[#8a1c26] border-[#d4a644]',
                chartHeader: 'bg-gradient-to-r from-[#630c18] via-[#7c1423] to-[#520813] border-[#d4a644]/60',
                chartTitle: 'text-[#fae19c]',
                chartSub: 'text-[#f0d8a8]',
                chartTotalBox: 'text-[#fae19c] border-[#d4a644]/55 bg-[#3d060e]/70',
                chartTotalVal: 'text-[#fffaf0]',
                chartDivider: 'bg-[#c5932e]/30',
                chartLegendBox: 'bg-[#faf3e4]/85 border-[#c5932e]/42',
                legendSchedCard: 'text-[#75500d] bg-[#fbf3df] border-[#c5932e]/55',
                legendSchedLabel: 'text-[#8c6314]',
                legendSchedVal: 'text-[#3d0b12]',
                legendSchedSh: 'bg-[#f7e5be] text-[#854d0e] border-[#c5932e]/50',
                legendSchedPct: 'bg-[#fffdf7] text-[#7a520e] border-[#c5932e]/50',
                legendDelayCard: 'text-[#7a1220] bg-[#fbeae8] border-[#8a1c26]/38',
                legendDelayLabel: 'text-[#8a1c26]',
                legendDelayVal: 'text-[#4a0811]',
                legendDelaySh: 'bg-[#f5d4d2] text-[#6b101d] border-[#8a1c26]/40',
                legendDelayPct: 'bg-[#fffdf7] text-[#7a1220] border-[#8a1c26]/40',
                legendMeta: 'text-[#5c232b]',
                matrixPctCell: 'text-[#6b101d] bg-[#f7ebd3] border-[#c5932e]/45',
                matrixDelayRemark: 'text-[#fff8e7] bg-[#8a1c26]',
                matrixSchedRemark: 'text-[#3a050c] bg-[#e0b85c]',
                matrixPeriodCell: 'text-[#3d0b12] bg-[#f5e7ca] border-[#c5932e]/45',
                matrixWppCell: 'text-[#6b101d] bg-[#faefd9] border-[#c5932e]/45',
                matrixOkLabel: 'text-[#7a520e] bg-[#fbf1d9] border-[#c5932e]/45',
                matrixOkCell: 'text-[#2d0c11] bg-[#fffdf7]',
                matrixOkTotal: 'bg-[#f3e1b8] text-[#4a0811]',
                matrixShLabel: 'text-[#8a1c26] bg-[#f9e5e3] border-[#8a1c26]/30',
                matrixShCell: 'text-[#7a1220] bg-[#fff8f7]',
                matrixShTotal: 'bg-[#f3d1cf] text-[#5c0b17]',
                matrixRiwLabel: 'text-[#92400e] bg-[#fcf0d6] border-[#c5932e]/45',
                matrixRiwCell: 'text-[#7c370b] bg-[#fffbf2]',
                matrixRiwTotal: 'bg-[#f4dfb1] text-[#542407]',
                matrixFooterSched: 'text-[#1e573b] bg-[#ebf4ee]',
                matrixFooterDelay: 'text-[#7a1220] bg-[#f9e6e4]',
                matrixFooterPct: 'text-[#6b101d] bg-[#f7ebd3]',
                matrixFooterPctVal: 'bg-[#6b101d] text-[#fae19c]',
                matrixEmptyCell: 'bg-[#f6ecda]',
                recapWrap: 'bg-[#fffdf7] border-[#c5932e]/45',
                recapTh: 'bg-[#6b101d] text-[#fae19c] border-[#d4a644]/40',
                recapRow: 'border-[#c5932e]/25 hover:bg-[#f9efd9]',
                recapText: 'text-[#2d0c11]',
                recapMuted: 'text-[#7e5247]'
            }
        },

        'sun-moon': {
            id: 'sun-moon',
            name: 'Sun & Moon',
            shortName: 'Celestial',
            subtitle: 'Kontras surya emas & bulan indigo — langit fajar yang elegan dan jernih',
            badge: 'Celestial',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#151e42', '#f5b942', '#f7f5ee', '#4f46e5'],
            chart: {
                plotBgTop: 'rgba(255, 253, 247, 0.94)',
                plotBgBottom: 'rgba(235, 240, 252, 0.80)',
                plotWatermark: 'rgba(217, 140, 28, 0.16)',
                plotWatermarkStyle: 'celestial',
                plotCorners: 'rgba(79, 70, 229, 0.45)',
                gridColor: 'rgba(30, 41, 89, 0.09)',
                borderColor: 'rgba(217, 140, 28, 0.48)',
                tickColor: '#25305c',
                tooltipBg: 'rgba(18, 26, 58, 0.96)',
                tooltipBorder: '#f5b942',
                tooltipTitle: '#fde68a',
                tooltipBody: '#f8fafc',
                delayZoneBg: 'rgba(79, 70, 229, 0.09)',
                delayZoneHatch: 'rgba(217, 140, 28, 0.15)',
                delayDivider: '#4f46e5',
                delayLabel: '#312e81',
                donutCenterBg: '#fffdf8',
                donutRingOuter: 'rgba(245, 185, 66, 0.85)',
                donutRingInner: 'rgba(79, 70, 229, 0.35)',
                donutRays: 'rgba(245, 185, 66, 0.50)',
                donutPctColor: '#151e42',
                donutSubColor: '#54618a',
                trendLine: '#d98c1c',
                trendAreaTop: 'rgba(245, 185, 66, 0.32)',
                trendAreaBottom: 'rgba(79, 70, 229, 0.04)',
                trendRegression: '#4f46e5',
                barTrend: '#1e2b5c',
                pointBg: '#fffdf8',
                pointBorder: '#d98c1c',
                sliceBorder: '#fffdf8',
                sliceHoverBorder: '#f5b942',
                datalabelText: '#ffffff',
                datalabelBg: 'rgba(21, 30, 66, 0.86)',
                series: {
                    sched: { fill: '#e09a24', border: '#b37412' },
                    shOnsched: { fill: '#f59e0b', border: '#c27405' },
                    delay: { fill: '#4338ca', border: '#312e81' },
                    shDelay: { fill: '#1e1b4b', border: '#0f172a' }
                },
                legendCaption: 'Surya Emas = On-Sched • Amber = Potensi SH • Indigo Bulan = Delay • Malam = Delay SH'
            },
            export: {
                bg: '#f7f5ee',
                border: '#d99a26',
                title: '#151e42',
                subtitle: '#4d5b86',
                thBg: '#172148',
                thText: '#fde68a',
                bodyText: '#171e3b',
                tableBg: '#ffffff',
                cellBorder: '#d9dff0'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#dce3fb] hover:text-white hover:bg-[#31407a]/60 whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#e0d4ff] hover:text-white hover:bg-[#31407a]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fde68a] hover:text-white hover:bg-[#31407a]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#fcd067] to-[#d9921e] text-[#141c3d] shadow-md border border-[#fff2bd]/80 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#6366f1] to-[#4338ca] text-white shadow-md border border-[#c7d2fe]/70 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#f59e0b] to-[#b45309] text-white shadow-md border border-[#fde68a]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fde68a] bg-[#0e1532]/90 hover:bg-[#1e2b5c] border border-[#f5b942]/55 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#141c3d] bg-gradient-to-r from-[#fcd067] to-[#e5a229] hover:from-[#fde08d] hover:to-[#f5b942] border border-[#fff3c4]/75 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-[#4338ca] border border-[#fcd067] flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#18234d] to-[#2c3a7a] text-[#fde68a] border border-[#f5b942] shadow-sm font-bold',
                catInactive: 'text-[#283566] hover:text-[#141c3d] hover:bg-white border border-transparent',
                closedCard: 'border-[#0f766e]/25 bg-[#f2fbf9] hover:bg-[#e6f7f3]',
                closedTitle: 'text-[#115e59]',
                closedSub: 'text-[#0f766e]',
                closedChip: 'bg-white border-[#d99a26]/35 text-[#25305c]',
                closedChipVal: 'text-[#141c3d]',
                cnd3Card: 'bg-[#eef0ff] border-[#4338ca]/35 text-[#312e81]',
                cnd2Card: 'bg-[#fef7e6] border-[#d99a26]/45 text-[#92580c]',
                cndTitle: 'text-[#151e42]',
                shArrivedCard: 'bg-[#f4f6fc] border-[#4f46e5]/25 opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#fef6e4] border-[#d99a26]/55',
                shArrivedBadge: 'text-[#115e59] bg-[#e6f7f3] border-[#0f766e]/30',
                shOpenBadge: 'text-[#141c3d] bg-[#fcd067] border-[#d9921e]',
                chartHeader: 'bg-gradient-to-r from-[#121a3a] via-[#1f2d61] to-[#26356e] border-[#f5b942]/60',
                chartTitle: 'text-[#fde68a]',
                chartSub: 'text-[#cbd5f5]',
                chartTotalBox: 'text-[#fde68a] border-[#f5b942]/50 bg-[#0c1229]/75',
                chartTotalVal: 'text-white',
                chartDivider: 'bg-[#d99a26]/30',
                chartLegendBox: 'bg-[#f8f6f0]/90 border-[#d99a26]/40',
                legendSchedCard: 'text-[#8c590c] bg-[#fef7e6] border-[#e09a24]/50',
                legendSchedLabel: 'text-[#a1660e]',
                legendSchedVal: 'text-[#151e42]',
                legendSchedSh: 'bg-[#fde9bd] text-[#854d0e] border-[#e09a24]/45',
                legendSchedPct: 'bg-white text-[#8c590c] border-[#e09a24]/45',
                legendDelayCard: 'text-[#312e81] bg-[#eef0ff] border-[#4f46e5]/35',
                legendDelayLabel: 'text-[#4338ca]',
                legendDelayVal: 'text-[#1e1b4b]',
                legendDelaySh: 'bg-[#dde2ff] text-[#312e81] border-[#4f46e5]/38',
                legendDelayPct: 'bg-white text-[#312e81] border-[#4f46e5]/38',
                legendMeta: 'text-[#475580]',
                matrixPctCell: 'text-[#172148] bg-[#fef4dc] border-[#d99a26]/45',
                matrixDelayRemark: 'text-white bg-[#4338ca]',
                matrixSchedRemark: 'text-[#141c3d] bg-[#fcd067]',
                matrixPeriodCell: 'text-[#151e42] bg-[#eef2fb] border-[#4f46e5]/25',
                matrixWppCell: 'text-[#312e81] bg-[#f5f7fd] border-[#4f46e5]/25',
                matrixOkLabel: 'text-[#8c590c] bg-[#fef6e4] border-[#e09a24]/40',
                matrixOkCell: 'text-[#151e42] bg-white',
                matrixOkTotal: 'bg-[#fae8bc] text-[#452804]',
                matrixShLabel: 'text-[#3730a3] bg-[#eef0ff] border-[#4f46e5]/30',
                matrixShCell: 'text-[#312e81] bg-[#f8f9ff]',
                matrixShTotal: 'bg-[#dce1ff] text-[#1e1b4b]',
                matrixRiwLabel: 'text-[#9a5409] bg-[#fff4db] border-[#d99a26]/40',
                matrixRiwCell: 'text-[#7c4308] bg-[#fffcf4]',
                matrixRiwTotal: 'bg-[#fae1a8] text-[#4c2804]',
                matrixFooterSched: 'text-[#115e59] bg-[#eaf8f5]',
                matrixFooterDelay: 'text-[#312e81] bg-[#eef0ff]',
                matrixFooterPct: 'text-[#172148] bg-[#fef4dc]',
                matrixFooterPctVal: 'bg-[#172148] text-[#fde68a]',
                matrixEmptyCell: 'bg-[#f4f5fa]',
                recapWrap: 'bg-white border-[#d99a26]/40',
                recapTh: 'bg-[#172148] text-[#fde68a] border-[#f5b942]/40',
                recapRow: 'border-[#d9dff0] hover:bg-[#f5f7fd]',
                recapText: 'text-[#151e42]',
                recapMuted: 'text-[#55638c]'
            }
        },

        'doodle-paint': {
            id: 'doodle-paint',
            name: 'Doodle Scribble Paint',
            shortName: 'Doodle',
            subtitle: 'Kertas sketsa cerah, garis tinta komik & cipratan warna cat ekspresif',
            badge: 'Creative',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#2563eb', '#f43f5e', '#f59e0b', '#fffdf5'],
            chart: {
                plotBgTop: 'rgba(255, 255, 255, 0.96)',
                plotBgBottom: 'rgba(255, 252, 238, 0.88)',
                plotWatermark: 'rgba(37, 99, 235, 0.14)',
                plotWatermarkStyle: 'doodle',
                plotCorners: 'rgba(30, 41, 59, 0.72)',
                gridColor: 'rgba(30, 41, 59, 0.11)',
                borderColor: '#1e293b',
                tickColor: '#1e293b',
                tooltipBg: 'rgba(15, 23, 42, 0.96)',
                tooltipBorder: '#fbbf24',
                tooltipTitle: '#fde047',
                tooltipBody: '#ffffff',
                delayZoneBg: 'rgba(244, 63, 94, 0.10)',
                delayZoneHatch: 'rgba(244, 63, 94, 0.22)',
                delayDivider: '#f43f5e',
                delayLabel: '#be123c',
                donutCenterBg: '#ffffff',
                donutRingOuter: '#1e293b',
                donutRingInner: 'rgba(37, 99, 235, 0.45)',
                donutRays: 'rgba(245, 158, 11, 0.55)',
                donutPctColor: '#1e293b',
                donutSubColor: '#475569',
                trendLine: '#2563eb',
                trendAreaTop: 'rgba(37, 99, 235, 0.26)',
                trendAreaBottom: 'rgba(251, 191, 36, 0.05)',
                trendRegression: '#f43f5e',
                barTrend: '#1e293b',
                pointBg: '#fde047',
                pointBorder: '#1e293b',
                sliceBorder: '#1e293b',
                sliceHoverBorder: '#f59e0b',
                datalabelText: '#ffffff',
                datalabelBg: '#1e293b',
                series: {
                    sched: { fill: '#10b981', border: '#1e293b' },
                    shOnsched: { fill: '#f59e0b', border: '#1e293b' },
                    delay: { fill: '#f43f5e', border: '#1e293b' },
                    shDelay: { fill: '#8b5cf6', border: '#1e293b' }
                },
                legendCaption: 'Cat Mint = On-Sched • Kuning = Potensi SH • Koral = Delay • Ungu = Delay SH'
            },
            export: {
                bg: '#fffdf5',
                border: '#1e293b',
                title: '#1e293b',
                subtitle: '#475569',
                thBg: '#2563eb',
                thText: '#ffffff',
                bodyText: '#141926',
                tableBg: '#ffffff',
                cellBorder: '#cbd5e1'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-[#1e293b] hover:bg-[#fef08a] border-2 border-transparent hover:border-[#1e293b] whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-[#7c3aed] hover:bg-[#ede9fe] border-2 border-transparent hover:border-[#1e293b] flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-[#e11d48] hover:bg-[#ffe4e6] border-2 border-transparent hover:border-[#1e293b] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-lg text-xs font-black transition bg-[#2563eb] text-white border-2 border-[#1e293b] shadow-[2px_2px_0_#1e293b] whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-lg text-xs font-black transition bg-[#8b5cf6] text-white border-2 border-[#1e293b] shadow-[2px_2px_0_#1e293b] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-lg text-xs font-black transition bg-[#f43f5e] text-white border-2 border-[#1e293b] shadow-[2px_2px_0_#1e293b] flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-lg text-xs font-black transition text-[#1e293b] bg-[#fef08a] hover:bg-[#fde047] border-2 border-[#1e293b] shadow-[2px_2px_0_#1e293b] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-lg text-xs font-black transition text-white bg-[#10b981] hover:bg-[#059669] border-2 border-[#1e293b] shadow-[2px_2px_0_#1e293b] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-lg text-xs font-black transition text-white bg-[#1e293b] border-2 border-[#1e293b] shadow-[2px_2px_0_#f59e0b] flex items-center gap-1.5 whitespace-nowrap shrink-0',
                catActive: 'bg-[#2563eb] text-white border-2 border-[#1e293b] shadow-[2px_2px_0_#1e293b] font-black',
                catInactive: 'text-[#1e293b] hover:bg-[#fef08a] border-2 border-transparent font-bold',
                closedCard: 'border-2 border-[#1e293b] bg-[#ecfdf5] hover:bg-[#d1fae5]',
                closedTitle: 'text-[#065f46]',
                closedSub: 'text-[#047857]',
                closedChip: 'bg-white border-2 border-[#1e293b] text-[#1e293b]',
                closedChipVal: 'text-[#1e293b]',
                cnd3Card: 'bg-[#fff1f2] border-2 border-[#1e293b] text-[#be123c]',
                cnd2Card: 'bg-[#fefce8] border-2 border-[#1e293b] text-[#b45309]',
                cndTitle: 'text-[#1e293b]',
                shArrivedCard: 'bg-[#f1f5f9] border-2 border-[#1e293b]/50 opacity-85 hover:opacity-100',
                shOpenCard: 'bg-[#fef9c3] border-2 border-[#1e293b]',
                shArrivedBadge: 'text-[#065f46] bg-[#d1fae5] border border-[#1e293b]',
                shOpenBadge: 'text-white bg-[#f43f5e] border border-[#1e293b]',
                chartHeader: 'bg-gradient-to-r from-[#fef08a] via-[#fffdf5] to-[#dbeafe] border-b-2 border-[#1e293b]',
                chartTitle: 'text-[#1e293b]',
                chartSub: 'text-[#334155]',
                chartTotalBox: 'text-[#1e293b] border-2 border-[#1e293b] bg-white shadow-[2px_2px_0_#1e293b]',
                chartTotalVal: 'text-[#2563eb]',
                chartDivider: 'bg-[#1e293b]/25',
                chartLegendBox: 'bg-[#fffdf5] border-2 border-dashed border-[#1e293b]/55',
                legendSchedCard: 'text-[#065f46] bg-[#d1fae5] border-2 border-[#1e293b]',
                legendSchedLabel: 'text-[#047857]',
                legendSchedVal: 'text-[#1e293b]',
                legendSchedSh: 'bg-[#fef08a] text-[#92400e] border border-[#1e293b]',
                legendSchedPct: 'bg-white text-[#065f46] border border-[#1e293b]',
                legendDelayCard: 'text-[#be123c] bg-[#ffe4e6] border-2 border-[#1e293b]',
                legendDelayLabel: 'text-[#e11d48]',
                legendDelayVal: 'text-[#1e293b]',
                legendDelaySh: 'bg-[#ede9fe] text-[#6d28d9] border border-[#1e293b]',
                legendDelayPct: 'bg-white text-[#be123c] border border-[#1e293b]',
                legendMeta: 'text-[#334155]',
                matrixPctCell: 'text-[#1e293b] bg-[#fef08a] border-[#1e293b]/40',
                matrixDelayRemark: 'text-white bg-[#f43f5e]',
                matrixSchedRemark: 'text-[#1e293b] bg-[#34d399]',
                matrixPeriodCell: 'text-[#1e293b] bg-[#dbeafe] border-[#1e293b]/35',
                matrixWppCell: 'text-[#1d4ed8] bg-[#eff6ff] border-[#1e293b]/35',
                matrixOkLabel: 'text-[#065f46] bg-[#d1fae5] border-[#1e293b]/30',
                matrixOkCell: 'text-[#1e293b] bg-white',
                matrixOkTotal: 'bg-[#a7f3d0] text-[#064e3b]',
                matrixShLabel: 'text-[#be123c] bg-[#ffe4e6] border-[#1e293b]/30',
                matrixShCell: 'text-[#9f1239] bg-[#fff5f6]',
                matrixShTotal: 'bg-[#fecdd3] text-[#881337]',
                matrixRiwLabel: 'text-[#92400e] bg-[#fef3c7] border-[#1e293b]/30',
                matrixRiwCell: 'text-[#78350f] bg-[#fffbeb]',
                matrixRiwTotal: 'bg-[#fde68a] text-[#451a03]',
                matrixFooterSched: 'text-[#065f46] bg-[#d1fae5]',
                matrixFooterDelay: 'text-[#be123c] bg-[#ffe4e6]',
                matrixFooterPct: 'text-[#1e293b] bg-[#fef08a]',
                matrixFooterPctVal: 'bg-[#2563eb] text-white',
                matrixEmptyCell: 'bg-[#f8fafc]',
                recapWrap: 'bg-white border-2 border-[#1e293b]',
                recapTh: 'bg-[#2563eb] text-white border-[#1e293b]',
                recapRow: 'border-[#cbd5e1] hover:bg-[#fefce8]',
                recapText: 'text-[#1e293b]',
                recapMuted: 'text-[#475569]'
            }
        },

        'deep-space': {
            id: 'deep-space',
            name: 'Deep Space',
            shortName: 'Space',
            subtitle: 'Galaksi obsidian gelap, bintang sian & aksen nebula violet kosmik',
            badge: 'Cosmic',
            mode: 'dark',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#060918', '#38bdf8', '#a78bfa', '#111b3a'],
            chart: {
                plotBgTop: 'rgba(13, 21, 48, 0.92)',
                plotBgBottom: 'rgba(6, 9, 24, 0.88)',
                plotWatermark: 'rgba(56, 189, 248, 0.16)',
                plotWatermarkStyle: 'stars',
                plotCorners: 'rgba(56, 189, 248, 0.55)',
                gridColor: 'rgba(148, 163, 184, 0.13)',
                borderColor: 'rgba(56, 189, 248, 0.38)',
                tickColor: '#cbd5e1',
                tooltipBg: 'rgba(8, 13, 32, 0.96)',
                tooltipBorder: '#38bdf8',
                tooltipTitle: '#7dd3fc',
                tooltipBody: '#f1f5f9',
                delayZoneBg: 'rgba(167, 139, 250, 0.13)',
                delayZoneHatch: 'rgba(244, 63, 94, 0.18)',
                delayDivider: '#f43f5e',
                delayLabel: '#fda4af',
                donutCenterBg: '#0b1228',
                donutRingOuter: 'rgba(56, 189, 248, 0.72)',
                donutRingInner: 'rgba(167, 139, 250, 0.40)',
                donutRays: 'rgba(56, 189, 248, 0.42)',
                donutPctColor: '#7dd3fc',
                donutSubColor: '#94a3b8',
                trendLine: '#38bdf8',
                trendAreaTop: 'rgba(56, 189, 248, 0.30)',
                trendAreaBottom: 'rgba(167, 139, 250, 0.03)',
                trendRegression: '#a78bfa',
                barTrend: '#38bdf8',
                pointBg: '#060918',
                pointBorder: '#38bdf8',
                sliceBorder: '#0b1228',
                sliceHoverBorder: '#7dd3fc',
                datalabelText: '#f8fafc',
                datalabelBg: 'rgba(6, 9, 24, 0.85)',
                series: {
                    sched: { fill: '#38bdf8', border: '#0284c7' },
                    shOnsched: { fill: '#f59e0b', border: '#d97706' },
                    delay: { fill: '#f43f5e', border: '#be123c' },
                    shDelay: { fill: '#a78bfa', border: '#7c3aed' }
                },
                legendCaption: 'Sian Kosmik = On-Sched • Amber = Potensi SH • Supernova = Delay • Nebula = Delay SH'
            },
            export: {
                bg: '#080d22',
                border: '#38bdf8',
                title: '#7dd3fc',
                subtitle: '#94a3b8',
                thBg: '#121e42',
                thText: '#7dd3fc',
                bodyText: '#f1f5f9',
                tableBg: '#0d1530',
                cellBorder: '#243563'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#cbd5e1] hover:text-[#7dd3fc] hover:bg-[#16234d] whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d8b4fe] hover:text-white hover:bg-[#2a1d4f] flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fda4af] hover:text-white hover:bg-[#3d1629] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-r from-[#0284c7] to-[#38bdf8] text-[#050816] shadow-[0_0_14px_rgba(56,189,248,0.4)] border border-[#bae6fd]/70 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-r from-[#7c3aed] to-[#a78bfa] text-white shadow-[0_0_14px_rgba(167,139,250,0.4)] border border-[#ddd6fe]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-r from-[#e11d48] to-[#fb7185] text-white shadow-[0_0_14px_rgba(244,63,94,0.4)] border border-[#fecdd3]/60 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#7dd3fc] bg-[#0e1736] hover:bg-[#162452] border border-[#38bdf8]/45 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#050816] bg-gradient-to-r from-[#38bdf8] to-[#818cf8] hover:brightness-110 border border-[#bae6fd]/60 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-[#7c3aed] border border-[#38bdf8] flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#0284c7] to-[#6366f1] text-white border border-[#7dd3fc]/70 shadow-sm font-bold',
                catInactive: 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#131f44] border border-transparent',
                closedCard: 'border-[#10b981]/30 bg-[#0b2323] hover:bg-[#0f2f2e]',
                closedTitle: 'text-[#6ee7b7]',
                closedSub: 'text-[#34d399]',
                closedChip: 'bg-[#091229] border-[#38bdf8]/30 text-[#cbd5e1]',
                closedChipVal: 'text-white',
                cnd3Card: 'bg-[#2a1020] border-[#f43f5e]/45 text-[#fda4af]',
                cnd2Card: 'bg-[#281e10] border-[#f59e0b]/45 text-[#fcd34d]',
                cndTitle: 'text-[#f1f5f9]',
                shArrivedCard: 'bg-[#0e1733] border-[#38bdf8]/25 opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#261e12] border-[#f59e0b]/50',
                shArrivedBadge: 'text-[#6ee7b7] bg-[#0c2d26] border-[#10b981]/40',
                shOpenBadge: 'text-[#fff1f2] bg-[#be123c] border-[#fb7185]/60',
                chartHeader: 'bg-gradient-to-r from-[#091129] via-[#121f47] to-[#1a1642] border-[#38bdf8]/35',
                chartTitle: 'text-[#7dd3fc]',
                chartSub: 'text-[#94a3b8]',
                chartTotalBox: 'text-[#7dd3fc] border-[#38bdf8]/45 bg-[#060918]/85',
                chartTotalVal: 'text-white',
                chartDivider: 'bg-[#38bdf8]/25',
                chartLegendBox: 'bg-[#0a122a] border-[#38bdf8]/28',
                legendSchedCard: 'text-[#7dd3fc] bg-[#0c223b] border-[#38bdf8]/40',
                legendSchedLabel: 'text-[#38bdf8]',
                legendSchedVal: 'text-white',
                legendSchedSh: 'bg-[#2d2110] text-[#fcd34d] border-[#f59e0b]/45',
                legendSchedPct: 'bg-[#060918] text-[#7dd3fc] border-[#38bdf8]/40',
                legendDelayCard: 'text-[#fda4af] bg-[#2a1020] border-[#f43f5e]/45',
                legendDelayLabel: 'text-[#fb7185]',
                legendDelayVal: 'text-[#ffe4e6]',
                legendDelaySh: 'bg-[#231542] text-[#d8b4fe] border-[#a78bfa]/45',
                legendDelayPct: 'bg-[#060918] text-[#fda4af] border-[#f43f5e]/45',
                legendMeta: 'text-[#94a3b8]',
                matrixPctCell: 'text-[#7dd3fc] bg-[#0f1d40] border-[#38bdf8]/35',
                matrixDelayRemark: 'text-white bg-[#be123c]',
                matrixSchedRemark: 'text-[#050816] bg-[#38bdf8]',
                matrixPeriodCell: 'text-[#e2e8f0] bg-[#101a38] border-[#38bdf8]/25',
                matrixWppCell: 'text-[#7dd3fc] bg-[#132044] border-[#38bdf8]/25',
                matrixOkLabel: 'text-[#7dd3fc] bg-[#0c223b] border-[#38bdf8]/30',
                matrixOkCell: 'text-[#e2e8f0] bg-[#0b1228]',
                matrixOkTotal: 'bg-[#122d4d] text-[#bae6fd]',
                matrixShLabel: 'text-[#fda4af] bg-[#2a1020] border-[#f43f5e]/35',
                matrixShCell: 'text-[#fecdd3] bg-[#190c18]',
                matrixShTotal: 'bg-[#3d1428] text-[#ffe4e6]',
                matrixRiwLabel: 'text-[#fcd34d] bg-[#291e0e] border-[#f59e0b]/35',
                matrixRiwCell: 'text-[#fde68a] bg-[#1a150c]',
                matrixRiwTotal: 'bg-[#3c2a10] text-[#fef3c7]',
                matrixFooterSched: 'text-[#6ee7b7] bg-[#0c2624]',
                matrixFooterDelay: 'text-[#fda4af] bg-[#2a1020]',
                matrixFooterPct: 'text-[#7dd3fc] bg-[#0f1d40]',
                matrixFooterPctVal: 'bg-[#38bdf8] text-[#050816]',
                matrixEmptyCell: 'bg-[#090f22]',
                recapWrap: 'bg-[#0b1228] border-[#38bdf8]/35',
                recapTh: 'bg-[#121f45] text-[#7dd3fc] border-[#38bdf8]/35',
                recapRow: 'border-[#1e2d57] hover:bg-[#132044]',
                recapText: 'text-[#f1f5f9]',
                recapMuted: 'text-[#94a3b8]'
            }
        },

        'ramadhan-kareem': {
            id: 'ramadhan-kareem',
            name: 'Ramadhan Kareem',
            shortName: 'Ramadhan',
            subtitle: 'Zamrud malam teduh, lentera fanous emas, bulan sabit & bintang geometris',
            badge: 'Kareem',
            mode: 'dark',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#08241b', '#e6bc53', '#155e46', '#faf3e0'],
            chart: {
                plotBgTop: 'rgba(13, 44, 34, 0.92)',
                plotBgBottom: 'rgba(6, 24, 18, 0.88)',
                plotWatermark: 'rgba(230, 188, 83, 0.16)',
                plotWatermarkStyle: 'arabesque',
                plotCorners: 'rgba(230, 188, 83, 0.65)',
                gridColor: 'rgba(230, 188, 83, 0.13)',
                borderColor: 'rgba(230, 188, 83, 0.42)',
                tickColor: '#e6dec8',
                tooltipBg: 'rgba(6, 26, 20, 0.97)',
                tooltipBorder: '#e6bc53',
                tooltipTitle: '#f8df8c',
                tooltipBody: '#fbf5e6',
                delayZoneBg: 'rgba(220, 38, 38, 0.12)',
                delayZoneHatch: 'rgba(230, 188, 83, 0.16)',
                delayDivider: '#f87171',
                delayLabel: '#fca5a5',
                donutCenterBg: '#09221a',
                donutRingOuter: 'rgba(230, 188, 83, 0.80)',
                donutRingInner: 'rgba(52, 211, 153, 0.35)',
                donutRays: 'rgba(248, 223, 140, 0.45)',
                donutPctColor: '#f8df8c',
                donutSubColor: '#a7cbbd',
                trendLine: '#e6bc53',
                trendAreaTop: 'rgba(230, 188, 83, 0.32)',
                trendAreaBottom: 'rgba(16, 185, 129, 0.04)',
                trendRegression: '#34d399',
                barTrend: '#e6bc53',
                pointBg: '#082018',
                pointBorder: '#f8df8c',
                sliceBorder: '#082018',
                sliceHoverBorder: '#f8df8c',
                datalabelText: '#fbf5e6',
                datalabelBg: 'rgba(6, 24, 18, 0.88)',
                series: {
                    sched: { fill: '#10b981', border: '#047857' },
                    shOnsched: { fill: '#e6bc53', border: '#b58824' },
                    delay: { fill: '#dc2626', border: '#991b1b' },
                    shDelay: { fill: '#9f1239', border: '#6b0b25' }
                },
                legendCaption: 'Zamrud = On-Sched • Emas Lentera = Potensi SH • Merah = Delay • Delima Gelap = Delay SH'
            },
            export: {
                bg: '#08221a',
                border: '#e6bc53',
                title: '#f8df8c',
                subtitle: '#a7cbbd',
                thBg: '#0f382b',
                thText: '#f8df8c',
                bodyText: '#fbf5e6',
                tableBg: '#0b2b21',
                cellBorder: '#235947'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#d4eadf] hover:text-[#f8df8c] hover:bg-[#123d2f] whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#e9d5ff] hover:text-[#f8df8c] hover:bg-[#123d2f] flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fde68a] hover:text-white hover:bg-[#123d2f] flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#f0cf70] to-[#c6952c] text-[#071c15] shadow-md border border-[#fff2bd]/75 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#1e5c4a] to-[#0f382b] text-[#f8df8c] shadow-md border border-[#e6bc53]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#b45309] to-[#78350f] text-[#fef3c7] shadow-md border border-[#f8df8c]/75 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#f8df8c] bg-[#0a2a20] hover:bg-[#134233] border border-[#e6bc53]/50 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#071c15] bg-gradient-to-r from-[#f2d478] to-[#cf9e32] hover:brightness-110 border border-[#fff2bd]/70 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#071c15] bg-[#f8df8c] border border-white flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#d4a53a] to-[#b0801e] text-[#071c15] border border-[#f8df8c] shadow-sm font-bold',
                catInactive: 'text-[#a9cdbf] hover:text-[#f8df8c] hover:bg-[#10382b] border border-transparent',
                closedCard: 'border-[#34d399]/35 bg-[#0d2f24] hover:bg-[#123f31]',
                closedTitle: 'text-[#6ee7b7]',
                closedSub: 'text-[#34d399]',
                closedChip: 'bg-[#082018] border-[#e6bc53]/35 text-[#e6dec8]',
                closedChipVal: 'text-[#fbf5e6]',
                cnd3Card: 'bg-[#2a1216] border-[#f87171]/40 text-[#fecaca]',
                cnd2Card: 'bg-[#29220e] border-[#e6bc53]/45 text-[#f8df8c]',
                cndTitle: 'text-[#fbf5e6]',
                shArrivedCard: 'bg-[#0c2920] border-[#e6bc53]/25 opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#29220e] border-[#e6bc53]/55',
                shArrivedBadge: 'text-[#6ee7b7] bg-[#0c3528] border-[#34d399]/40',
                shOpenBadge: 'text-[#071c15] bg-[#e6bc53] border-[#fff0ba]',
                chartHeader: 'bg-gradient-to-r from-[#071d16] via-[#0e362a] to-[#0a271e] border-[#e6bc53]/45',
                chartTitle: 'text-[#f8df8c]',
                chartSub: 'text-[#a7cbbd]',
                chartTotalBox: 'text-[#f8df8c] border-[#e6bc53]/45 bg-[#061812]/80',
                chartTotalVal: 'text-[#fbf5e6]',
                chartDivider: 'bg-[#e6bc53]/28',
                chartLegendBox: 'bg-[#09211a] border-[#e6bc53]/32',
                legendSchedCard: 'text-[#6ee7b7] bg-[#0c2f24] border-[#34d399]/38',
                legendSchedLabel: 'text-[#34d399]',
                legendSchedVal: 'text-[#fbf5e6]',
                legendSchedSh: 'bg-[#2a230e] text-[#f8df8c] border-[#e6bc53]/45',
                legendSchedPct: 'bg-[#061812] text-[#6ee7b7] border-[#34d399]/40',
                legendDelayCard: 'text-[#fca5a5] bg-[#2a1216] border-[#f87171]/40',
                legendDelayLabel: 'text-[#f87171]',
                legendDelayVal: 'text-[#fee2e2]',
                legendDelaySh: 'bg-[#36111c] text-[#fda4af] border-[#fb7185]/40',
                legendDelayPct: 'bg-[#061812] text-[#fca5a5] border-[#f87171]/40',
                legendMeta: 'text-[#a7cbbd]',
                matrixPctCell: 'text-[#f8df8c] bg-[#10382b] border-[#e6bc53]/40',
                matrixDelayRemark: 'text-white bg-[#b91c1c]',
                matrixSchedRemark: 'text-[#071c15] bg-[#e6bc53]',
                matrixPeriodCell: 'text-[#fbf5e6] bg-[#0e3327] border-[#e6bc53]/30',
                matrixWppCell: 'text-[#f8df8c] bg-[#123d2f] border-[#e6bc53]/30',
                matrixOkLabel: 'text-[#6ee7b7] bg-[#0c2f24] border-[#34d399]/30',
                matrixOkCell: 'text-[#fbf5e6] bg-[#09221a]',
                matrixOkTotal: 'bg-[#124233] text-[#d1fae5]',
                matrixShLabel: 'text-[#fca5a5] bg-[#2a1216] border-[#f87171]/35',
                matrixShCell: 'text-[#fecaca] bg-[#1b0d10]',
                matrixShTotal: 'bg-[#3d151b] text-[#fee2e2]',
                matrixRiwLabel: 'text-[#f8df8c] bg-[#2a230e] border-[#e6bc53]/35',
                matrixRiwCell: 'text-[#fde68a] bg-[#1a1609]',
                matrixRiwTotal: 'bg-[#3d3212] text-[#fef3c7]',
                matrixFooterSched: 'text-[#6ee7b7] bg-[#0d3226]',
                matrixFooterDelay: 'text-[#fca5a5] bg-[#2a1216]',
                matrixFooterPct: 'text-[#f8df8c] bg-[#10382b]',
                matrixFooterPctVal: 'bg-[#e6bc53] text-[#071c15]',
                matrixEmptyCell: 'bg-[#081d16]',
                recapWrap: 'bg-[#09221a] border-[#e6bc53]/38',
                recapTh: 'bg-[#0f382b] text-[#f8df8c] border-[#e6bc53]/40',
                recapRow: 'border-[#1d4c3c] hover:bg-[#113a2c]',
                recapText: 'text-[#fbf5e6]',
                recapMuted: 'text-[#a7cbbd]'
            }
        },

        'christmas-festive': {
            id: 'christmas-festive',
            name: 'Christmas',
            shortName: 'Christmas',
            subtitle: 'Salju krim Nordik, cemara hijau pinus, merah holly & kilau emas natal',
            badge: 'Festive',
            mode: 'light',
            useBatikPatterns: false,
            showGunungan: false,
            swatches: ['#113f2c', '#b4202e', '#d4a23e', '#fbfaf6'],
            chart: {
                plotBgTop: 'rgba(255, 255, 255, 0.95)',
                plotBgBottom: 'rgba(244, 248, 245, 0.84)',
                plotWatermark: 'rgba(17, 63, 44, 0.13)',
                plotWatermarkStyle: 'snowflakes',
                plotCorners: 'rgba(212, 162, 62, 0.65)',
                gridColor: 'rgba(17, 63, 44, 0.10)',
                borderColor: 'rgba(17, 63, 44, 0.35)',
                tickColor: '#1d3c2e',
                tooltipBg: 'rgba(15, 56, 39, 0.96)',
                tooltipBorder: '#d4a23e',
                tooltipTitle: '#fae09e',
                tooltipBody: '#ffffff',
                delayZoneBg: 'rgba(180, 32, 46, 0.09)',
                delayZoneHatch: 'rgba(180, 32, 46, 0.16)',
                delayDivider: '#b4202e',
                delayLabel: '#991b27',
                donutCenterBg: '#ffffff',
                donutRingOuter: 'rgba(212, 162, 62, 0.82)',
                donutRingInner: 'rgba(17, 63, 44, 0.35)',
                donutRays: 'rgba(212, 162, 62, 0.45)',
                donutPctColor: '#113f2c',
                donutSubColor: '#4c6b5d',
                trendLine: '#156343',
                trendAreaTop: 'rgba(21, 99, 67, 0.24)',
                trendAreaBottom: 'rgba(251, 250, 246, 0.02)',
                trendRegression: '#b4202e',
                barTrend: '#113f2c',
                pointBg: '#ffffff',
                pointBorder: '#b4202e',
                sliceBorder: '#ffffff',
                sliceHoverBorder: '#d4a23e',
                datalabelText: '#ffffff',
                datalabelBg: 'rgba(17, 63, 44, 0.88)',
                series: {
                    sched: { fill: '#156343', border: '#0d422c' },
                    shOnsched: { fill: '#d4a23e', border: '#a67b24' },
                    delay: { fill: '#b4202e', border: '#871420' },
                    shDelay: { fill: '#6e101c', border: '#4a0912' }
                },
                legendCaption: 'Cemara = On-Sched • Emas Natal = Potensi SH • Holly = Delay • Crimson Gelap = Delay SH'
            },
            export: {
                bg: '#fbfaf6',
                border: '#156343',
                title: '#113f2c',
                subtitle: '#4c6b5d',
                thBg: '#113f2c',
                thText: '#fae09e',
                bodyText: '#142920',
                tableBg: '#ffffff',
                cellBorder: '#d3dfd8'
            },
            ui: {
                navInactive: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#e2f2ea] hover:text-white hover:bg-[#1e5c42]/70 whitespace-nowrap shrink-0',
                navInactivePaylater: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fde2e4] hover:text-white hover:bg-[#1e5c42]/70 flex items-center gap-1 whitespace-nowrap shrink-0',
                navInactiveRocket: 'px-3 py-1.5 rounded-md text-xs font-semibold transition text-[#fae09e] hover:text-white hover:bg-[#1e5c42]/70 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#c92838] to-[#991825] text-white shadow-md border border-[#fae09e]/75 whitespace-nowrap shrink-0',
                navActivePaylater: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#e0b85c] to-[#b58622] text-[#0e3223] shadow-md border border-[#fff2bd]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navActiveRocket: 'px-3 py-1.5 rounded-md text-xs font-bold transition bg-gradient-to-b from-[#d93040] to-[#991825] text-[#fae09e] shadow-md border border-[#fae09e]/80 flex items-center gap-1 whitespace-nowrap shrink-0',
                navMasterIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#fae09e] bg-[#0b2a1d] hover:bg-[#18523a] border border-[#d4a23e]/55 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0',
                navInputIdle: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-white bg-gradient-to-r from-[#c92838] to-[#a11b28] hover:brightness-110 border border-[#fae09e]/75 flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                navActionActive: 'px-3 py-1.5 rounded-md text-xs font-bold transition text-[#0e3223] bg-[#fae09e] border border-white flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0',
                catActive: 'bg-gradient-to-r from-[#113f2c] to-[#1a593f] text-[#fae09e] border border-[#d4a23e] shadow-sm font-bold',
                catInactive: 'text-[#1d4534] hover:text-[#113f2c] hover:bg-white border border-transparent',
                closedCard: 'border-[#156343]/25 bg-[#f2f9f5] hover:bg-[#e5f4ec]',
                closedTitle: 'text-[#113f2c]',
                closedSub: 'text-[#156343]',
                closedChip: 'bg-white border-[#d4a23e]/40 text-[#1d4534]',
                closedChipVal: 'text-[#113f2c]',
                cnd3Card: 'bg-[#fdf2f3] border-[#b4202e]/35 text-[#991b27]',
                cnd2Card: 'bg-[#fdf7e7] border-[#d4a23e]/45 text-[#92620f]',
                cndTitle: 'text-[#142920]',
                shArrivedCard: 'bg-[#f4f7f5] border-[#156343]/25 opacity-80 hover:opacity-100',
                shOpenCard: 'bg-[#fdf5e2] border-[#d4a23e]/55',
                shArrivedBadge: 'text-[#113f2c] bg-[#e5f4ec] border-[#156343]/30',
                shOpenBadge: 'text-white bg-[#b4202e] border-[#d4a23e]',
                chartHeader: 'bg-gradient-to-r from-[#0e3625] via-[#175138] to-[#0f3a28] border-[#d4a23e]/60',
                chartTitle: 'text-[#fae09e]',
                chartSub: 'text-[#d1e8dc]',
                chartTotalBox: 'text-[#fae09e] border-[#d4a23e]/55 bg-[#092418]/75',
                chartTotalVal: 'text-white',
                chartDivider: 'bg-[#d4a23e]/30',
                chartLegendBox: 'bg-[#fbfaf6] border-[#d4a23e]/42',
                legendSchedCard: 'text-[#113f2c] bg-[#edf7f1] border-[#156343]/35',
                legendSchedLabel: 'text-[#156343]',
                legendSchedVal: 'text-[#0d2e20]',
                legendSchedSh: 'bg-[#f9ebd0] text-[#8c5b0e] border-[#d4a23e]/50',
                legendSchedPct: 'bg-white text-[#113f2c] border-[#156343]/35',
                legendDelayCard: 'text-[#991b27] bg-[#fdf1f2] border-[#b4202e]/35',
                legendDelayLabel: 'text-[#b4202e]',
                legendDelayVal: 'text-[#6e101c]',
                legendDelaySh: 'bg-[#f8d8dc] text-[#871420] border-[#b4202e]/38',
                legendDelayPct: 'bg-white text-[#991b27] border-[#b4202e]/38',
                legendMeta: 'text-[#4c6b5d]',
                matrixPctCell: 'text-[#113f2c] bg-[#f7ebd1] border-[#d4a23e]/45',
                matrixDelayRemark: 'text-white bg-[#b4202e]',
                matrixSchedRemark: 'text-white bg-[#156343]',
                matrixPeriodCell: 'text-[#113f2c] bg-[#eaf3ee] border-[#156343]/30',
                matrixWppCell: 'text-[#156343] bg-[#f3f9f6] border-[#156343]/25',
                matrixOkLabel: 'text-[#113f2c] bg-[#e9f5ee] border-[#156343]/30',
                matrixOkCell: 'text-[#142920] bg-white',
                matrixOkTotal: 'bg-[#cfe8db] text-[#0d3223]',
                matrixShLabel: 'text-[#991b27] bg-[#fceced] border-[#b4202e]/30',
                matrixShCell: 'text-[#871420] bg-[#fff8f8]',
                matrixShTotal: 'bg-[#f6d0d4] text-[#6e101c]',
                matrixRiwLabel: 'text-[#8c5b0e] bg-[#fbf0d8] border-[#d4a23e]/40',
                matrixRiwCell: 'text-[#734a08] bg-[#fffcf4]',
                matrixRiwTotal: 'bg-[#f5dfa9] text-[#4a2f04]',
                matrixFooterSched: 'text-[#113f2c] bg-[#e7f4ed]',
                matrixFooterDelay: 'text-[#991b27] bg-[#fceced]',
                matrixFooterPct: 'text-[#113f2c] bg-[#f7ebd1]',
                matrixFooterPctVal: 'bg-[#b4202e] text-white',
                matrixEmptyCell: 'bg-[#f4f6f4]',
                recapWrap: 'bg-white border-[#156343]/35',
                recapTh: 'bg-[#113f2c] text-[#fae09e] border-[#d4a23e]/45',
                recapRow: 'border-[#dce6e0] hover:bg-[#f2f8f4]',
                recapText: 'text-[#142920]',
                recapMuted: 'text-[#4c6b5d]'
            }
        }
    };

    window.EWIP_THEMES = EWIP_THEMES;

    let themeTransitionTimer = null;
    let popoverCloseTimer = null;

    function getActiveThemeId() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && EWIP_THEMES[saved]) return saved;
        } catch (e) {}
        return DEFAULT_THEME_ID;
    }

    function getThemeConfig(id) {
        const key = id && EWIP_THEMES[id] ? id : getActiveThemeId();
        return EWIP_THEMES[key] || EWIP_THEMES[DEFAULT_THEME_ID];
    }

    function buildThemePreviewSvg(t) {
        const palettes = {
            'default':           { bg: '#f1f5f9', nav: '#0f172a', card: '#ffffff', border: '#cbd5e1', bar1: '#0ea5e9', bar2: '#10b981', bar3: '#ef4444', accent: '#0ea5e9', badge: '#e0f2fe', kind: 'clean' },
            'royal-batik':       { bg: '#160d07', nav: '#24150a', card: '#2b1a0e', border: '#d4a843', bar1: '#e0b85c', bar2: '#34d399', bar3: '#ef4444', accent: '#f4d47c', badge: '#3b2412', kind: 'gold' },
            'batik-ivory':       { bg: '#f9f3e6', nav: '#4e2e16', card: '#fffdf7', border: '#cfa45a', bar1: '#8b5a2b', bar2: '#2d7a4f', bar3: '#b91c1c', accent: '#c9972e', badge: '#f4e6c8', kind: 'gold' },
            'industrial-dark':   { bg: '#0b1120', nav: '#0f172a', card: '#1e293b', border: '#38bdf8', bar1: '#38bdf8', bar2: '#22c55e', bar3: '#f43f5e', accent: '#38bdf8', badge: '#172554', kind: 'tech' },
            'emerald-nusantara': { bg: '#061913', nav: '#0a291f', card: '#0f3327', border: '#dfb74c', bar1: '#10b981', bar2: '#f4d87c', bar3: '#f87171', accent: '#f4d87c', badge: '#134232', kind: 'gold' },
            'macos-glass':       { bg: '#dde8f8', nav: '#f6f9fe', card: '#ffffff', border: '#93c5fd', bar1: '#007aff', bar2: '#34c759', bar3: '#ff3b30', accent: '#007aff', badge: '#e0ecff', kind: 'macos' },
            'windows-98':        { bg: '#008080', nav: '#000080', card: '#c0c0c0', border: '#ffffff', bar1: '#000080', bar2: '#008000', bar3: '#800000', accent: '#000080', badge: '#dfdfdf', kind: 'win98' },
            'imperial-japan':    { bg: '#faf3e4', nav: '#630c18', card: '#fffdf7', border: '#c5932e', bar1: '#c5932e', bar2: '#8a1c26', bar3: '#246346', accent: '#f5d882', badge: '#f6e7c6', kind: 'japan' },
            'sun-moon':          { bg: '#f6f4ec', nav: '#151e42', card: '#ffffff', border: '#f5b942', bar1: '#f5b942', bar2: '#4338ca', bar3: '#0f766e', accent: '#f5b942', badge: '#eef0ff', kind: 'celestial' },
            'doodle-paint':      { bg: '#fffdf5', nav: '#ffffff', card: '#fef08a', border: '#1e293b', bar1: '#2563eb', bar2: '#10b981', bar3: '#f43f5e', accent: '#2563eb', badge: '#ffe4e6', kind: 'doodle' },
            'deep-space':        { bg: '#050816', nav: '#0e1836', card: '#111c3d', border: '#38bdf8', bar1: '#38bdf8', bar2: '#a78bfa', bar3: '#f43f5e', accent: '#7dd3fc', badge: '#1b2859', kind: 'space' },
            'ramadhan-kareem':   { bg: '#061b14', nav: '#0d3327', card: '#0f382b', border: '#e6bc53', bar1: '#e6bc53', bar2: '#10b981', bar3: '#dc2626', accent: '#f8df8c', badge: '#144938', kind: 'ramadhan' },
            'christmas-festive': { bg: '#fbfaf6', nav: '#113f2c', card: '#ffffff', border: '#d4a23e', bar1: '#156343', bar2: '#b4202e', bar3: '#d4a23e', accent: '#fae09e', badge: '#fceced', kind: 'christmas' }
        };
        const p = palettes[t.id] || {
            bg: t.swatches[2] || '#f8fafc',
            nav: t.swatches[0] || '#0f172a',
            card: '#ffffff',
            border: t.swatches[1] || '#94a3b8',
            bar1: t.swatches[1] || '#0ea5e9',
            bar2: t.swatches[3] || '#10b981',
            bar3: '#ef4444',
            accent: t.swatches[1] || '#0ea5e9',
            badge: t.swatches[2] || '#e2e8f0',
            kind: 'clean'
        };

        const isWin98 = p.kind === 'win98';
        const isDoodle = p.kind === 'doodle';
        const rx = isWin98 ? '0' : '6';
        const cardRx = isWin98 ? '0' : '3';
        const strokeW = isDoodle ? '1.6' : '1';

        let motif = '';
        if (p.kind === 'macos') {
            motif = `<circle cx="7" cy="6" r="1.5" fill="#ff5f56"/><circle cx="12" cy="6" r="1.5" fill="#ffbd2e"/><circle cx="17" cy="6" r="1.5" fill="#27c93f"/>`;
        } else if (isWin98) {
            motif = `<rect x="44" y="3" width="5" height="5" fill="#c0c0c0" stroke="#404040" stroke-width="0.6"/>`;
        } else if (p.kind === 'space') {
            motif = `<circle cx="44" cy="18" r="1" fill="#7dd3fc"/><circle cx="48" cy="24" r="0.8" fill="#c4b5fd"/><circle cx="38" cy="15" r="0.7" fill="#ffffff"/>`;
        } else if (p.kind === 'ramadhan' || p.kind === 'celestial') {
            motif = `<path d="M46.5 4.2 A2.8 2.8 0 1 1 43.8 7 A2.2 2.2 0 1 0 46.5 4.2 Z" fill="${p.accent}"/>`;
        } else if (p.kind === 'christmas') {
            motif = `<circle cx="44" cy="6" r="1.6" fill="#e11d48"/><circle cx="47.5" cy="6" r="1.6" fill="#fae09e"/>`;
        } else if (p.kind === 'japan') {
            motif = `<circle cx="45" cy="6" r="2.2" fill="none" stroke="#f5d882" stroke-width="0.9"/><circle cx="45" cy="6" r="0.8" fill="#f5d882"/>`;
        } else {
            motif = `<rect x="40" y="4.5" width="8" height="3" rx="1.5" fill="${p.accent}" opacity="0.95"/>`;
        }

        return `
            <svg viewBox="0 0 54 40" class="w-full h-full block" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="0.75" y="0.75" width="52.5" height="38.5" rx="${rx}" fill="${p.bg}" stroke="${p.border}" stroke-width="${strokeW}"/>
                <path d="${isWin98 ? 'M1 1 H53 V11 H1 Z' : 'M1.2 6.5 Q1.2 1.2 6.5 1.2 H47.5 Q52.8 1.2 52.8 6.5 V11.2 H1.2 Z'}" fill="${p.nav}"/>
                ${isDoodle ? '<line x1="1" y1="11.2" x2="53" y2="11.2" stroke="#1e293b" stroke-width="1.3"/>' : `<line x1="1.2" y1="11.2" x2="52.8" y2="11.2" stroke="${p.accent}" stroke-width="0.9" opacity="0.8"/>`}
                ${p.kind !== 'macos' ? `<rect x="5" y="4.5" width="14" height="3" rx="1.2" fill="${p.accent}" opacity="0.95"/>` : ''}
                ${motif}
                <!-- Mini KPI Card -->
                <rect x="4.5" y="14.5" width="19" height="10" rx="${cardRx}" fill="${p.card}" stroke="${p.border}" stroke-width="${isDoodle ? '1.1' : '0.65'}" stroke-opacity="0.85"/>
                <rect x="7" y="17" width="8" height="2" rx="0.8" fill="${p.accent}"/>
                <rect x="7" y="20.6" width="13" height="1.8" rx="0.8" fill="${p.bar1}" opacity="0.7"/>
                <!-- Mini Badge Card -->
                <rect x="4.5" y="26.5" width="19" height="9" rx="${cardRx}" fill="${p.badge}" stroke="${p.border}" stroke-width="${isDoodle ? '1.1' : '0.55'}" stroke-opacity="0.75"/>
                <rect x="7" y="29.5" width="11" height="2.4" rx="1" fill="${p.bar2}"/>
                <!-- Mini Chart Card -->
                <rect x="26" y="14.5" width="23.5" height="21" rx="${cardRx}" fill="${p.card}" stroke="${p.border}" stroke-width="${isDoodle ? '1.1' : '0.65'}" stroke-opacity="0.85"/>
                <rect x="29.5" y="25" width="4" height="7.5" rx="1" fill="${p.bar1}"/>
                <rect x="35.5" y="20.5" width="4" height="12" rx="1" fill="${p.bar2}"/>
                <rect x="41.5" y="27.5" width="4" height="5" rx="1" fill="${p.bar3}"/>
            </svg>
        `;
    }

    function renderThemePickerMenu() {
        const listEl = document.getElementById('theme-picker-list');
        if (!listEl) return;
        const activeId = getActiveThemeId();

        listEl.innerHTML = Object.values(EWIP_THEMES).map(t => {
            const isActive = t.id === activeId;
            return `
                <button type="button" onclick="window.applyTheme('${t.id}', { closeMenu: true, toast: true, animate: true, event: event })"
                    class="theme-option-card ${isActive ? 'is-active' : ''}">
                    <div class="theme-preview-icon" aria-hidden="true">
                        ${buildThemePreviewSvg(t)}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-bold text-xs truncate">${t.name}</span>
                            <span class="theme-mode-tag shrink-0">${t.badge}</span>
                        </div>
                        <p class="text-[10px] opacity-75 truncate mt-0.5">${t.subtitle}</p>
                        <div class="flex items-center gap-1 mt-1" aria-hidden="true">
                            <span class="w-2.5 h-2.5 rounded-full border border-black/15" style="background:${t.swatches[0]}"></span>
                            <span class="w-2.5 h-2.5 rounded-full border border-black/15" style="background:${t.swatches[1]}"></span>
                            <span class="w-2.5 h-2.5 rounded-full border border-black/15" style="background:${t.swatches[2]}"></span>
                            <span class="w-2.5 h-2.5 rounded-full border border-black/15" style="background:${t.swatches[3]}"></span>
                        </div>
                    </div>
                    ${isActive ? '<span class="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style="background:var(--accent-main);color:var(--accent-on);"><i data-lucide="check" class="w-3 h-3"></i></span>' : ''}
                </button>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    function updateThemeTriggerBadge(theme) {
        const btn = document.getElementById('btn-theme-switcher');
        if (btn) {
            btn.setAttribute('title', `Ganti Tema (Aktif: ${theme.name})`);
            btn.setAttribute('aria-label', `Ganti Tema (Aktif: ${theme.name})`);
        }

        // Toggle traditional Gunungan SVG crests for Batik themes
        document.querySelectorAll('.ewip-batik-crest').forEach(el => {
            el.classList.toggle('hidden', !theme.showGunungan);
        });
    }

    function closeThemePopoverSmooth() {
        const pop = document.getElementById('theme-picker-popover');
        if (!pop || pop.classList.contains('hidden')) return;
        pop.classList.remove('is-open');
        if (popoverCloseTimer) clearTimeout(popoverCloseTimer);
        popoverCloseTimer = setTimeout(() => {
            pop.classList.add('hidden');
        }, 180);
    }

    function openThemePopoverSmooth() {
        const pop = document.getElementById('theme-picker-popover');
        if (!pop) return;
        if (popoverCloseTimer) clearTimeout(popoverCloseTimer);
        renderThemePickerMenu();
        pop.classList.remove('hidden');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pop.classList.add('is-open');
            });
        });
    }

    function getTransitionOrigin(options) {
        const ev = options && options.event;
        if (ev && typeof ev.clientX === 'number' && typeof ev.clientY === 'number' && (ev.clientX > 0 || ev.clientY > 0)) {
            return { x: ev.clientX, y: ev.clientY };
        }
        const btn = document.getElementById('btn-theme-switcher');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return { x: window.innerWidth - 36, y: 28 };
    }

    function applyTheme(themeId, options = {}) {
        const theme = EWIP_THEMES[themeId] ? EWIP_THEMES[themeId] : EWIP_THEMES[DEFAULT_THEME_ID];
        const prevThemeId = document.body ? document.body.getAttribute('data-theme') : null;
        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const shouldAnimate = options.animate === true && !prefersReduced && prevThemeId && prevThemeId !== theme.id;

        const commitThemeDOM = () => {
            document.body.setAttribute('data-theme', theme.id);
            document.body.setAttribute('data-theme-mode', theme.mode);

            try {
                localStorage.setItem(STORAGE_KEY, theme.id);
            } catch (e) {}

            updateThemeTriggerBadge(theme);
            renderThemePickerMenu();

            if (options.closeMenu) {
                const pop = document.getElementById('theme-picker-popover');
                if (pop) {
                    pop.classList.remove('is-open');
                    pop.classList.add('hidden');
                }
            }

            // Re-sync live navigation classes, charts, and report tables if app.js is already loaded
            if (typeof window.syncAppAfterThemeChange === 'function') {
                window.__ewipThemeSwitching = true;
                try {
                    window.syncAppAfterThemeChange(theme);
                } finally {
                    window.__ewipThemeSwitching = false;
                }
            }
        };

        const showThemeToast = () => {
            if (options.toast && typeof window.showToast === 'function') {
                window.showToast(`Tema diganti ke: ${theme.name}`, 'info');
            }
        };

        if (shouldAnimate && typeof document.startViewTransition === 'function') {
            const origin = getTransitionOrigin(options);
            const endRadius = Math.hypot(
                Math.max(origin.x, window.innerWidth - origin.x),
                Math.max(origin.y, window.innerHeight - origin.y)
            );
            document.documentElement.classList.add('ewip-vt-radial');
            try {
                const transition = document.startViewTransition(() => {
                    commitThemeDOM();
                });
                transition.ready.then(() => {
                    document.documentElement.animate(
                        {
                            clipPath: [
                                `circle(0px at ${origin.x}px ${origin.y}px)`,
                                `circle(${endRadius}px at ${origin.x}px ${origin.y}px)`
                            ]
                        },
                        {
                            duration: 500,
                            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            pseudoElement: '::view-transition-new(root)'
                        }
                    );
                }).catch(() => {});
                transition.finished.finally(() => {
                    document.documentElement.classList.remove('ewip-vt-radial');
                    showThemeToast();
                });
                return;
            } catch (e) {
                document.documentElement.classList.remove('ewip-vt-radial');
            }
        }

        // Coordinated CSS transition fallback (smooth across Safari/Firefox/older browsers)
        if (shouldAnimate) {
            document.documentElement.classList.add('ewip-theme-transitioning');
            if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
            commitThemeDOM();
            themeTransitionTimer = setTimeout(() => {
                document.documentElement.classList.remove('ewip-theme-transitioning');
                themeTransitionTimer = null;
            }, 460);
            showThemeToast();
        } else {
            commitThemeDOM();
            showThemeToast();
        }
    }

    function toggleThemePopover(e) {
        if (e) e.stopPropagation();
        const pop = document.getElementById('theme-picker-popover');
        if (!pop) return;
        const willOpen = pop.classList.contains('hidden');
        if (willOpen) {
            openThemePopoverSmooth();
        } else {
            closeThemePopoverSmooth();
        }
    }

    document.addEventListener('click', (e) => {
        const pop = document.getElementById('theme-picker-popover');
        const btn = document.getElementById('btn-theme-switcher');
        if (!pop || pop.classList.contains('hidden')) return;
        if (!pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
            closeThemePopoverSmooth();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeThemePopoverSmooth();
        }
    });

    window.getActiveThemeId = getActiveThemeId;
    window.getThemeConfig = getThemeConfig;
    window.applyTheme = applyTheme;
    window.toggleThemePopover = toggleThemePopover;

    // Apply saved theme immediately on script execution (instant, no startup animation)
    if (document.body) {
        applyTheme(getActiveThemeId(), { closeMenu: false, toast: false, animate: false });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            applyTheme(getActiveThemeId(), { closeMenu: false, toast: false, animate: false });
        });
    }
})();

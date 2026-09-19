/** Achievement catalogue (shared so the client can render names/icons for codes from the server). */

export interface AchievementDef {
  code: string;
  icon: string;
  name: { 'zh-TW': string; en: string };
  desc: { 'zh-TW': string; en: string };
}

const a = (code: string, icon: string, zh: [string, string], en: [string, string]): AchievementDef => ({
  code,
  icon,
  name: { 'zh-TW': zh[0], en: en[0] },
  desc: { 'zh-TW': zh[1], en: en[1] },
});

export const ACHIEVEMENTS: AchievementDef[] = [
  a('first_game', '🎉', ['初來乍到', '完成第一局遊戲'], ['First steps', 'Finish your first game']),
  a('games_10', '🧭', ['城市漫遊者', '完成 10 局遊戲'], ['City wanderer', 'Finish 10 games']),
  a('games_100', '🗺️', ['臺北活地圖', '完成 100 局遊戲'], ['Living map', 'Finish 100 games']),
  a('perfect_round', '🎯', ['正中紅心', '單回合拿到 5,000 分'], ['Bullseye', 'Score 5,000 in a round']),
  a('perfect_10', '🏹', ['神射手', '累積 10 次 5,000 分'], ['Sharpshooter', 'Score 5,000 in 10 rounds']),
  a('score_20k', '⭐', ['在地通', '單局 20,000 分以上'], ['Local expert', 'Score 20,000+ in a game']),
  a('score_24k', '🌟', ['臺北之神', '單局 24,000 分以上'], ['Taipei deity', 'Score 24,000+ in a game']),
  a('nmpz_20k', '🧊', ['定格大師', 'NMPZ 模式單局 20,000 分以上'], ['Freeze frame', 'Score 20,000+ in an NMPZ game']),
  a('speed_demon', '⚡', ['閃電判斷', '10 秒內猜出 4,000 分以上'], ['Lightning read', 'Score 4,000+ within 10 seconds']),
  a('daily_first', '📅', ['每日報到', '完成第一次每日挑戰'], ['Daily check-in', 'Finish a Daily Challenge']),
  a('daily_streak_7', '🔥', ['一週不間斷', '連續 7 天完成每日挑戰'], ['Week-long streak', 'Play the Daily Challenge 7 days in a row']),
  a('challenge_creator', '📨', ['下戰帖', '建立一個挑戰連結'], ['Gauntlet thrown', 'Create a challenge link']),
  a('streak_10', '🏃', ['區區不放過', '行政區連勝 10 題'], ['District runner', 'Reach a 10 district streak']),
  a('streak_25', '🏆', ['行政區達人', '行政區連勝 25 題'], ['District master', 'Reach a 25 district streak']),
  a('village_streak_5', '🏘️', ['里長伯', '里連勝 5 題'], ['Village chief', 'Reach a 5 village streak']),
  a('explorer_all_bronze', '🥉', ['十二區巡禮', '12 區都拿到銅牌以上'], ['Grand tour', 'Bronze or better in all 12 districts']),
  a('explorer_all_gold', '🥇', ['金牌探險家', '12 區都拿到金牌以上'], ['Golden explorer', 'Gold or better in all 12 districts']),
  a('explorer_all_platinum', '💎', ['白金傳說', '12 區都拿到白金'], ['Platinum legend', 'Platinum in all 12 districts']),
  a('duel_win', '⚔️', ['初試啼聲', '贏得一場對戰'], ['First blood', 'Win a duel']),
  a('duel_wins_10', '🛡️', ['決鬥者', '贏得 10 場對戰'], ['Duelist', 'Win 10 duels']),
  a('br_win', '👑', ['最後生還者', '贏得一場大逃殺'], ['Last one standing', 'Win a Battle Royale']),
  a('rank_gold', '🏅', ['金牌段位', '排位積分達到金牌'], ['Gold division', 'Reach the Gold division']),
  a('rank_master', '🎖️', ['大師段位', '排位積分達到大師'], ['Master division', 'Reach the Master division']),
  a('map_maker', '✏️', ['出題者', '發布一張公開地圖'], ['Cartographer', 'Publish a public map']),
  a('level_10', '📈', ['漸入佳境', '達到 10 等'], ['On the rise', 'Reach level 10']),
  a('level_25', '🚀', ['老臺北', '達到 25 等'], ['Old Taipei hand', 'Reach level 25']),
];

export const ACHIEVEMENT_BY_CODE = new Map(ACHIEVEMENTS.map((x) => [x.code, x]));

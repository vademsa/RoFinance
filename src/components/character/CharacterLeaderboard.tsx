import React, { useEffect, useState } from 'react';
import { ShieldCheck, Trophy } from 'lucide-react';
import { vietnamDate, type LeaderboardEntry } from '../../../shared/character';
import { characterApi, CharacterApiError } from '../../lib/characterApi';
import { characterError, type CharacterLanguage } from './characterText';
import { PixelCharacter } from './PixelCharacter';
import { EquippedAura } from './EquippedAura';
import { OUTFIT_SETS } from '../../utils/outfitSets';
import './character.css';

export function CharacterLeaderboard({ language, optIn, ownerId, refreshKey, onOpenProfile }: {
  language: CharacterLanguage; optIn: boolean | null; ownerId: string; refreshKey: number; onOpenProfile: () => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const currentSeason = vietnamDate().slice(0, 7);
  const [season, setSeason] = useState(currentSeason);
  const [loaded, setLoaded] = useState<{ season: string; owner: string; entries: LeaderboardEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [demo, setDemo] = useState(false);
  useEffect(() => { setDemo(false); }, [ownerId]);
  // Calendar choices are independent of the viewer's financial history.
  const seasons = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(`${currentSeason}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - offset);
    return date.toISOString().slice(0, 7);
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setLoaded(null);
    void characterApi.leaderboard(season).then((result) => {
      if (!cancelled) setLoaded({ season, owner: ownerId, entries: result.entries });
    }).catch((failure) => {
      if (!cancelled) setError(failure instanceof CharacterApiError ? failure.code : 'CHARACTER_UNAVAILABLE');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [season, ownerId, optIn, refreshKey, retry]);
  const entries = loaded?.season === season && loaded.owner === ownerId ? loaded.entries : [];
  // Pure presentation fixtures: never submitted, persisted or mixed with real rankings.
  const samples: LeaderboardEntry[] = [
    { rank: 1, nickname: t('Mẫu · Phượng hoàng', 'Demo · Phoenix'), characterId: 'sun', equipped: { ...OUTFIT_SETS.find((set) => set.id === 'phoenix')!.items }, score: 98 },
    { rank: 2, nickname: t('Mẫu · Thiên hà', 'Demo · Celestial'), characterId: 'cloud', equipped: { ...OUTFIT_SETS.find((set) => set.id === 'celestial')!.items }, score: 95 },
    { rank: 2, nickname: t('Mẫu · Hoàng gia', 'Demo · Royal'), characterId: 'leaf', equipped: { ...OUTFIT_SETS.find((set) => set.id === 'royal')!.items }, score: 95 },
    { rank: 4, nickname: t('Mẫu · Neon', 'Demo · Neon'), characterId: 'river', equipped: { ...OUTFIT_SETS.find((set) => set.id === 'neon')!.items }, score: 91 },
    { rank: 5, nickname: t('Mẫu · Xanh ngọc', 'Demo · Mint'), characterId: 'sun', equipped: { ...OUTFIT_SETS.find((set) => set.id === 'mint')!.items }, score: 87 },
  ];
  const displayed = demo ? samples : entries;
  return <section className="character-feature character-leaderboard" data-no-translate="true" aria-labelledby="character-leaderboard-title">
    <div className="character-heading-row">
      <div><span className="character-eyebrow">{t('CHỈ SỐ NHÂN VẬT · KHÔNG PHẢI SỐ TIỀN', 'CHARACTER SCORES · NOT FINANCIAL AMOUNTS')}</span>
        <h2 id="character-leaderboard-title" tabIndex={-1} className="character-title flex items-center gap-2"><Trophy size={23}/>{t('Bảng xếp hạng nhân vật', 'Character leaderboard')}</h2>
        <p className="character-muted">{t('Điểm từ chu kỳ đã kết thúc. Người có cùng điểm nhận cùng thứ hạng.', 'Scores from completed cycles. Equal scores share the same rank.')}</p>
      </div>
      <label className="character-form-label character-season-label">{t('Mùa xếp hạng', 'Ranking season')}
        <select className="character-select" disabled={demo} value={season} onChange={(event) => setSeason(event.target.value)}>
          {seasons.map((item) => <option key={item} value={item}>{new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'vi-VN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${item}-01T00:00:00Z`))}</option>)}
        </select>
      </label>
    </div>
    <div className="character-leaderboard-privacy"><ShieldCheck size={19} aria-hidden="true"/>
      <p>{t('Chỉ công khai biệt danh, nhân vật/trang phục, điểm và thứ hạng. Không hiển thị số tiền, giao dịch, ngân hàng, nợ, tỷ lệ tài chính hoặc cảm xúc riêng.',
        'Only aliases, dressed characters, scores and ranks are public. No amounts, transactions, banks, debts, financial ratios or private moods are shown.')}</p>
    </div>
    <div className="character-ranking-footer"><button type="button" className="character-button" aria-pressed={demo} onClick={() => setDemo((current) => !current)}>
      {demo ? t('Về bảng xếp hạng thật', 'Back to real leaderboard') : t('Xem bảng xếp hạng mẫu', 'View demo leaderboard')}</button>
      {demo && <p className="character-message" role="status">{t('Dữ liệu mô phỏng · Không phải người dùng thật. Điểm và trang phục chỉ minh họa, không ảnh hưởng tài khoản.', 'Demo data · Not real users. Scores and outfits are illustrative and do not affect any account.')}</p>}</div>
    {!demo && loading ? <p className="character-note" role="status">{t('Đang tải bảng xếp hạng…', 'Loading the leaderboard…')}</p>
      : !demo && error ? <div className="character-message character-error" role="alert">{characterError(error, language)}{' '}
        <button type="button" className="character-button" onClick={() => setRetry((current) => current + 1)}>{t('Thử lại', 'Try again')}</button></div>
      : displayed.length ? <ol className="character-ranking-list" aria-label={demo ? t('Nhân vật mô phỏng', 'Demo characters') : t('Top 50 nhân vật', 'Top 50 characters')}>
        {displayed.map((entry, index) => <li className="character-ranking-row" key={`${demo ? 'demo' : season}:${index}`}>
          <span className="character-rank" aria-label={`${t('Hạng', 'Rank')} ${entry.rank}`}>#{entry.rank}</span>
          {/* Deliberately neutral: private financial mood never enters public rendering. */}
          <div className="character-ranking-portrait"><EquippedAura equipped={entry.equipped} size={42}/><PixelCharacter characterId={entry.characterId} gender={entry.gender} equipped={entry.equipped} mood="steady" size={42} title={t('Nhân vật pixel', 'Pixel character')}/></div>
          <span className="character-ranking-alias">{entry.nickname}</span>
          <span className="character-ranking-score"><strong>{entry.score}</strong><span>{t('điểm', 'points')}</span></span>
        </li>)}
      </ol> : <p className="character-note" role="status">{t('Chưa có nhân vật tham gia với chu kỳ đủ điều kiện kết thúc trong mùa này.', 'No opted-in characters have an eligible completed cycle in this season yet.')}</p>}
    <div className="character-ranking-footer">
      <p className="character-muted">{optIn === null ? t('Chưa xác định được trạng thái tham gia. Mở hồ sơ để kiểm tra quyền riêng tư.', 'Participation status is unavailable. Open your profile to check privacy.')
        : optIn ? t('Bạn đã bật tham gia. Chỉ chu kỳ đủ điều kiện đã chốt mới được xếp hạng.', 'Participation is enabled. Only eligible settled cycles appear in the ranking.')
        : t('Nhân vật của bạn đang riêng tư. Bạn có thể tự nguyện tham gia trong Hồ sơ nhân vật.', 'Your character is private. You can choose to participate in Character Profile.')}</p>
      <button type="button" className="character-button" onClick={onOpenProfile}>{t('Hồ sơ nhân vật', 'Character profile')}</button>
    </div>
    <p className="character-note">{t('Mùa là tháng dương lịch mà chu kỳ lương kết thúc. Điểm dựa trên ghi chép tự khai, không đánh giá mức giàu hay xác minh qua ngân hàng. Không dùng điểm thưởng còn lại, độ hiếm trang phục hoặc thời điểm nộp để phân hạng. Chỉ hiển thị tối đa 50 nhân vật.',
      'A season is the calendar month when a salary cycle ends. Scores use self-reported records, not wealth or bank verification. Remaining reward points, outfit rarity and submission time do not affect rank. Up to 50 characters are displayed.')}</p>
  </section>;
}

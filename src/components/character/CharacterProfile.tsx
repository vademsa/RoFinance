import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Gift, RefreshCw, ShieldCheck, Shirt } from 'lucide-react';
import { CHARACTERS, CHARACTER_GENDERS, COSMETICS, DEFAULT_EQUIPMENT, DRAW_COST,
  assessFinance, validateEquipment, vietnamDate, type CharacterId, type CharacterGender, type Equipment, type FinanceForCharacter, type ItemSlot } from '../../../shared/character';
import type { MaterialKind, ItemMaterial } from '../../../shared/character';
import type { CharacterController } from '../../hooks/useCharacterProfile';
import { useDrawReveal } from '../../hooks/useDrawReveal';
import { PixelCharacter } from './PixelCharacter';
import { EquippedAura } from './EquippedAura';
import { OutfitSets } from './OutfitSets';
import { cosmeticTheme, equippedLegendary, themeColors } from '../../utils/cosmeticPresentation';
import { RewardDrawPanel } from './RewardDrawPanel';
import { RewardDrawDialog } from './RewardDrawDialog';
import { OwnedWardrobe } from './OwnedWardrobe';
import { DuplicateWorkshop } from './DuplicateWorkshop';
import { RewardCatalogueDialog } from './RewardCatalogueDialog';
import { characterError, genderLabels, label, moodLabels, reasonLabels, type CharacterLanguage } from './characterText';
import './character.css';

export function CharacterProfile({ controller, finance, language, onBack, onAccount }: {
  controller: CharacterController; finance: FinanceForCharacter; language: CharacterLanguage; onBack: () => void; onAccount: () => void;
}) {
  const { profile, loading, busy, error, pending } = controller;
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const [tab, setTab] = useState<'wardrobe' | 'rewards' | 'privacy'>('wardrobe');
  const [slot, setSlot] = useState<ItemSlot | ''>('');
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState<{ kind: MaterialKind; itemId: string } | null>(null);
  const [selectedCycle, setSelectedCycle] = useState('');
  const [draftEquipment, setDraftEquipment] = useState<Equipment>({ ...DEFAULT_EQUIPMENT });
  const [draftCharacter, setDraftCharacter] = useState<CharacterId>('sun');
  const [draftGender, setDraftGender] = useState<CharacterGender>('male');
  const [nickname, setNickname] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [message, setMessage] = useState('');
  const drawReturnFocus = useRef<HTMLElement | null>(null);
  const drawReveal = useDrawReveal(profile?.enrolledAt || null, controller.draw);
  const equipmentSignature = JSON.stringify(profile?.equipped);
  useEffect(() => {
    if (profile) { setDraftEquipment({ ...profile.equipped }); setDraftCharacter(profile.characterId); }
  }, [equipmentSignature, profile?.characterId]);
  useEffect(() => { if (profile) { setNickname(profile.nickname); setOptIn(profile.optIn); } }, [profile?.nickname, profile?.optIn]);
  useEffect(() => { if (profile) setDraftGender(profile.gender ?? 'male'); }, [profile?.gender]);
  const historical = [...(finance.monthlySummaries || [])].sort((a, b) => b.cycleStart.localeCompare(a.cycleStart));
  const assessment = assessFinance(finance, vietnamDate(), selectedCycle || undefined);
  const canSave = profile && validateEquipment(draftEquipment, profile.ownedItemIds) && !busy && !loading;
  const dirty = profile && (equipmentSignature !== JSON.stringify(draftEquipment) || draftCharacter !== profile.characterId || draftGender !== (profile.gender ?? 'male'));
  const legendary = equippedLegendary(draftEquipment);
  const backdropTheme = legendary ? cosmeticTheme(legendary) : 'plain';
  const [themeMain, themeLight] = themeColors[backdropTheme];
  const saveOutfit = async () => {
    setMessage('');
    if (await controller.update({ equipped: draftEquipment, characterId: draftCharacter, gender: draftGender })) setMessage(t('Đã lưu nhân vật và trang phục.', 'Character and outfit saved.'));
  };
  const draw = async () => {
    if (drawReveal.opening || busy || loading || !profile || (pending && pending.kind !== 'draw') || (!pending && profile.availablePoints < DRAW_COST)) return;
    if (!drawReveal.visible) drawReturnFocus.current = document.activeElement as HTMLElement | null;
    setMessage('');
    await drawReveal.run();
  };
  const openDraw = () => {
    if (drawReveal.opening || busy || loading || !profile || (pending && pending.kind !== 'draw')) return;
    drawReturnFocus.current = document.activeElement as HTMLElement | null;
    setMessage(''); drawReveal.show();
  };
  const exchange = async (itemId: string) => {
    setMessage('');
    if (await controller.exchange(itemId)) setMessage(t('Đã đổi vật phẩm. Bạn có thể mặc trong tủ đồ.', 'Item exchanged. You can equip it in your wardrobe.'));
  };
  const preview = (itemId: string, fromCatalogue = false) => {
    const item = COSMETICS.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setDraftEquipment((current) => ({ ...current, [item.slot]: item.id }));
    if (fromCatalogue) { setSlot(item.slot); setTab('wardrobe'); setCatalogueOpen(false); }
  };
  const transform = async (kind: MaterialKind, items: ItemMaterial[]) => {
    if (drawReveal.opening || busy || loading) return null;
    setMessage('');
    const response = await controller.transform(kind, items);
    if (!response?.result || !('kind' in response.result)) return null;
    const prize = COSMETICS.find((item) => item.id === response.result!.itemId);
    setMessage(prize ? `${t('Ghép thành công', 'Fusion complete')}: ${language === 'en' ? prize.en : prize.vi}${response.result.duplicate ? t(' · thêm 1 bản dư', ' · 1 spare copy added') : ''}`
      : t('Đã phân giải 2 bản dư và cộng 20 điểm thưởng.', '2 spare copies recycled for 20 reward points.'));
    return response.result;
  };
  const ownedCollection = profile && <OwnedWardrobe profile={profile} language={language} characterId={draftCharacter} equipped={draftEquipment}
    slot={slot} onSlot={setSlot} onPreview={(id) => preview(id)} onRemove={(itemSlot) => setDraftEquipment((current) => ({ ...current, [itemSlot]: null }))}
    materialsDisabled={busy || loading || drawReveal.opening || Boolean(pending)} onMaterials={(kind, itemId) => { setMessage(''); setMaterialOpen({ kind, itemId }); }}
    onOpenCatalogue={tab === 'wardrobe' ? () => { setMessage(''); setCatalogueOpen(true); } : undefined}/>;
  return <section className="character-feature character-profile" data-no-translate="true"
    data-unsaved-changes={Boolean(dirty || (profile && (nickname !== profile.nickname || optIn !== profile.optIn)))} aria-labelledby="character-profile-title">
    <div className="character-heading-row">
      <div><span className="character-eyebrow">{t('ROFINANCE · BẠN ĐỒNG HÀNH PIXEL', 'ROFINANCE · PIXEL COMPANION')}</span>
        <h1 id="character-profile-title" className="character-title">{t('Hồ sơ nhân vật', 'Character profile')}</h1>
        <p className="character-muted">{t('Một người bạn nhỏ đồng hành cùng từng chu kỳ lương của bạn.', 'A little companion for every salary cycle.')}</p>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={onBack} className="character-button"><ArrowLeft size={15}/>{t('Quay lại', 'Back')}</button>
        <button type="button" onClick={onAccount} className="character-button">{t('Hồ sơ tài khoản', 'Account profile')}</button></div>
    </div>
    {error && <div className="character-message character-error" role="alert">{characterError(error, language)}{' '}
      <button type="button" className="underline font-bold" onClick={() => void controller.refresh()} disabled={busy || loading}>{t('Tải lại', 'Reload')}</button></div>}
    {message && <p className="character-message" role="status">{message}</p>}
    {!profile ? <div className="character-note" role="status">{loading ? t('Đang mở hồ sơ nhân vật…', 'Opening your character profile…') : t('Hồ sơ nhân vật chưa sẵn sàng. Bạn vẫn có thể dùng các chức năng tài chính.', 'Your character profile is unavailable. Financial features remain available.')}</div> : <div className="character-layout">
      <aside className="character-stack">
        <div className="character-card">
          <div className="character-stage" data-theme={backdropTheme} style={{ '--theme-main': themeMain, '--theme-light': themeLight } as React.CSSProperties}>
            <EquippedAura equipped={draftEquipment} ownedItemIds={profile.ownedItemIds}/><PixelCharacter characterId={draftCharacter} gender={draftGender} equipped={draftEquipment} mood={assessment.mood} size={170} animated title={t('Xem trước nhân vật', 'Character preview')}/></div>
          <div className="character-mood"><span>{label(moodLabels[assessment.mood], language)}</span><span className="character-muted">{t('Cấp', 'Level')} {profile.level}</span></div>
          <OutfitSets equipped={draftEquipment} ownedItemIds={profile.ownedItemIds} language={language} disabled={busy || loading || drawReveal.opening}
            onPreview={(items) => { setDraftEquipment(items); setMessage(''); }}/>
          <fieldset className="character-gender-picker"><legend>{t('Giới tính nhân vật', 'Character gender')}</legend>
            {CHARACTER_GENDERS.map(gender => <label key={gender} className="character-gender-option"><input type="radio" name="character-gender" value={gender} checked={draftGender === gender} disabled={busy || loading} onChange={() => setDraftGender(gender)}/><span>{label(genderLabels[gender], language)}</span></label>)}
          </fieldset>
          <p className="character-note">{t('Đổi giới tính không mất đồ hoặc điểm. Trang phục Nam/Nữ là kiểu dáng; bạn vẫn có thể phối đồ dùng chung và đồ đã sở hữu.', 'Changing gender keeps your items and points. Male/Female clothing labels describe style; you can still mix unisex and owned items.')}</p>
          <div className="character-character-picker" aria-label={t('Chọn nhân vật', 'Choose a character')}>
            {CHARACTERS.map((character) => <button type="button" key={character.id} aria-pressed={draftCharacter === character.id} aria-label={language === 'en' ? character.en : character.vi}
              className="character-character-choice" onClick={() => setDraftCharacter(character.id)} disabled={busy}>
              <PixelCharacter characterId={character.id} gender={draftGender} equipped={profile.equipped} size={40} title={language === 'en' ? character.en : character.vi}/>
              <span>{language === 'en' ? character.en : character.vi}</span>
            </button>)}
          </div>
          <div className="character-actions"><button type="button" className="character-button character-button-primary" onClick={() => void saveOutfit()} disabled={!canSave || !dirty}><Check size={15}/>{t('Lưu trang phục', 'Save outfit')}</button>
            <button type="button" className="character-button" disabled={!dirty || busy} onClick={() => { setDraftEquipment({ ...profile.equipped }); setDraftCharacter(profile.characterId); setDraftGender(profile.gender ?? 'male'); }}>{t('Khôi phục', 'Reset preview')}</button></div>
          {dirty && !validateEquipment(draftEquipment, profile.ownedItemIds) && <p className="character-reasons">{t('Đang thử vật phẩm chưa sở hữu. Hãy quay hoặc đổi để có thể lưu.', 'You are previewing an unowned item. Draw or exchange it before saving.')}</p>}
        </div>
        <div className="character-card character-stack">
          <label className="character-form-label">{t('Cảm xúc theo chu kỳ', 'Mood by salary cycle')}
            <select className="character-select" value={selectedCycle} onChange={(event) => setSelectedCycle(event.target.value)}>
              <option value="">{t('Chu kỳ hiện tại', 'Current cycle')}</option>
              {historical.map((summary) => <option value={summary.cycleStart} key={summary.id}>{summary.cycleStart} – {summary.cycleEnd}</option>)}
            </select>
          </label>
          <div><p className="text-xs font-bold">{assessment.cycleStart} – {assessment.cycleEnd}</p>
            <p className="character-reasons">{t('Điểm quản lý', 'Management score')}: <strong>{assessment.score ?? '—'}</strong> / 100 · {t('Chỉ bạn xem được', 'Visible only to you')}</p>
            {assessment.reasons.map((reason) => <p className="character-reasons" key={reason}>{label(reasonLabels[reason] || reasonLabels.steady, language)}</p>)}
          </div>
          <p className="character-note">{t('Đây là cảm xúc của nhân vật dựa trên ghi chép, không phải đánh giá hạnh phúc của bạn. Điểm trong kỳ là tạm tính; thưởng được chốt sau khi kết thúc chu kỳ và dữ liệu đã lưu.',
            'This is a character mood based on your records, not a measure of your happiness. In-cycle scores are provisional; rewards settle after the cycle closes and records are saved.')}</p>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="character-tabs" aria-label={t('Các mục hồ sơ nhân vật', 'Character profile sections')}>
          {([
            ['wardrobe', Shirt, t('Tủ đồ', 'Wardrobe')], ['rewards', Gift, t('Quay thưởng', 'Rewards')], ['privacy', ShieldCheck, t('Quyền riêng tư', 'Privacy')],
          ] as const).map(([id, Icon, text]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className="inline-flex items-center gap-2"><Icon size={15}/>{text}</button>)}
        </div>
        {pending && !materialOpen && <div className="character-message" role="status">{t('Một lượt đang chờ xác nhận. Dùng nút xác nhận lại để nhận đúng kết quả mà không tiêu điểm thêm.', 'An action is awaiting confirmation. Confirm it again to retrieve the same result without spending extra points.')}
          <button type="button" className="character-button mt-2" disabled={busy || loading || drawReveal.opening} onClick={() => pending.kind === 'draw' ? openDraw() : pending.kind === 'exchange' ? void exchange(pending.itemId!) : setMaterialOpen({ kind: pending.kind, itemId: pending.items![0].itemId })}><RefreshCw size={14}/>{t('Xác nhận lại', 'Confirm again')}</button></div>}
        {tab === 'wardrobe' && ownedCollection}
        {tab === 'rewards' && <div className="character-stack">
          <RewardDrawPanel profile={profile} language={language} busy={busy || loading} opening={drawReveal.opening}
            pendingKind={pending?.kind} onDraw={openDraw}
            onShowRewards={() => { setMessage(''); setCatalogueOpen(true); }}
            />
          {ownedCollection}
          <p className="character-note">{t('Bạn nhận 40 điểm chào mừng một lần. Mỗi chu kỳ đủ dữ liệu đã kết thúc từ khi tạo nhân vật được thưởng tối đa 20 điểm theo điểm quản lý. Điểm xếp hạng không giảm khi quay. Không dùng tiền thật.',
            'You receive 40 welcome points once. Each eligible completed cycle from character enrolment awards up to 20 points based on management score. Drawing does not reduce ranking scores. No real money is used.')}</p>
          <p className="character-note">{t('Lưu khoản chi trong hôm nay tự nhận +20 điểm, tối đa một lần/ngày (giờ Việt Nam). Mỗi người dùng mới áp dụng từng mẫu hũ bạn chia sẻ cũng giúp bạn nhận +20 điểm. Điểm này chỉ dùng quay thưởng, không tăng điểm xếp hạng.', 'Save an expense dated today to automatically earn +20 points, once per day (Vietnam time). Each new user adopting each of your shared jar templates also earns you +20 points. These bonuses do not increase ranking scores.')}</p>
          {(profile.bonusPoints ?? 0) > 0 && <p className="character-note">{t(`Tài khoản đã nhận ${profile.bonusPoints} điểm bổ sung (ghi chép hằng ngày, mẫu cộng đồng hoặc Admin cấp). Không cộng vào điểm quản lý, cấp độ hoặc bảng xếp hạng.`,
            `This account has received ${profile.bonusPoints} bonus points (daily logging, community templates or Admin grants). Bonuses do not increase management scores, levels or leaderboard scores.`)}</p>}
          {profile.pointsShortfall > 0 && <p className="character-message">{t(`Ghi chép cũ đã được điều chỉnh. Cần bù ${profile.pointsShortfall} điểm bằng phần thưởng tiếp theo trước khi quay tiếp; vật phẩm của bạn vẫn được giữ.`,
            `Older records were corrected. Future rewards must offset ${profile.pointsShortfall} points before another draw; your items are kept.`)}</p>}
        </div>}
        {tab === 'privacy' && <form className="character-card character-stack" onSubmit={(event) => {
          event.preventDefault(); setMessage('');
          void controller.update({ nickname, optIn }).then((result) => { if (result) setMessage(t('Đã lưu tùy chọn riêng tư.', 'Privacy preferences saved.')); });
        }}>
          <h2 className="flex items-center gap-2"><ShieldCheck size={18}/>{t('Bạn chọn những gì được công khai', 'You choose what is public')}</h2>
          <label className="character-form-label">{t('Biệt danh công khai', 'Public alias')}
            <input className="character-input" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24} minLength={2} required autoComplete="off"/>
          </label>
          <p className="character-muted text-xs">{t('Biệt danh riêng cho nhân vật; không tự dùng tên tài khoản hoặc email của bạn.', 'A separate character alias; your account name or email is never copied automatically.')}</p>
          <label className="character-checkbox"><input type="checkbox" checked={optIn} onChange={(event) => setOptIn(event.target.checked)}/><span>{t('Tham gia bảng xếp hạng nhân vật trong Thống kê.', 'Join the character leaderboard in Statistics.')}</span></label>
          <p className="character-note">{t('Chỉ biệt danh, nhân vật/trang phục pixel, điểm tổng hợp và thứ hạng được hiển thị. Thu nhập, chi tiêu, số dư, khoản nợ, ngân hàng, giao dịch, tỷ lệ tài chính và lời giải thích riêng không được công khai. Tắt tham gia để gỡ nhân vật khỏi bảng xếp hạng.',
            'Only your alias, dressed pixel character, composite score and rank are shown. Income, spending, balances, debts, banks, transactions, financial ratios and private explanations are not published. Turn participation off to remove your character from the leaderboard.')}</p>
          <button type="submit" className="character-button character-button-primary" disabled={busy || loading}><ShieldCheck size={16}/>{t('Lưu quyền riêng tư', 'Save privacy preferences')}</button>
        </form>}
      </div>
    </div>}
    {drawReveal.visible && profile && <RewardDrawDialog profile={profile} language={language} opening={drawReveal.opening}
      runId={drawReveal.runId} startedAt={drawReveal.startedAt} busy={busy || loading} pendingKind={pending?.kind} error={error}
      onDraw={() => void draw()}
      confirmed={drawReveal.confirmed} result={drawReveal.result} onSettled={drawReveal.complete} onClose={drawReveal.dismiss} returnFocus={drawReturnFocus.current}
      onWardrobe={(itemSlot) => { setSlot(itemSlot); setTab('wardrobe'); }}/>}
    {catalogueOpen && profile && <RewardCatalogueDialog profile={profile} language={language} characterId={draftCharacter} equipped={draftEquipment}
      busy={busy || loading || drawReveal.opening} pending={pending} message={error ? characterError(error, language) : message}
      onClose={() => setCatalogueOpen(false)} onPreview={(id) => preview(id, true)} onExchange={(itemId) => void exchange(itemId)}/>}
    {materialOpen && profile && <DuplicateWorkshop key={`${materialOpen.kind}:${materialOpen.itemId}`} {...materialOpen} profile={profile} language={language}
      busy={busy || loading || drawReveal.opening} pending={pending} message={error ? characterError(error, language) : undefined}
      onClose={() => setMaterialOpen(null)} onTransform={transform}/>}
  </section>;
}

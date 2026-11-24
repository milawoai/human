/**
 * Sense 服务 — 感知子系统入口
 *
 * 管理听觉（hearing）等感知能力的启停与状态。
 */
import {
  startHearing,
  stopHearing,
  getHearingStatus,
  setAutoPasteToFocusedApp,
  submitHearingQuestion,
  submitRewriteConfirmed,
  openHearingPanel,
  closeHearingPanel,
  openChatPanel,
  closeChatPanel,
  consumePendingHearingConfirmed,
  getCurrentCompanionConversation,
  createCompanionConversation,
  getCompanionTranscript,
  submitCompanionQuestion,
  listAsrModels
} from './impl/hearing'

export {
  startHearing,
  stopHearing,
  getHearingStatus,
  setAutoPasteToFocusedApp,
  submitHearingQuestion,
  submitRewriteConfirmed,
  openHearingPanel,
  closeHearingPanel,
  openChatPanel,
  closeChatPanel,
  consumePendingHearingConfirmed,
  getCurrentCompanionConversation,
  createCompanionConversation,
  getCompanionTranscript,
  submitCompanionQuestion,
  listAsrModels
}

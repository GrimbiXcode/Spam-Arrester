import { Client } from 'tdl';
import { config } from '../config';
import { logger } from '../utils/logger';
import { looksSpam } from '../utils/heuristics';

export interface SpamDetectionResult {
  isSpam: boolean;
  score: number;
  reasons: string[];
}

export interface UserProfile {
  userId: number;
  isContact: boolean;
  isMutualContact: boolean;
  hasProfilePhoto: boolean;
  username?: string;
  hasCommonGroups: boolean;
}

export async function detectSpam(
  client: Client,
  message: any,
  userProfile: UserProfile
): Promise<SpamDetectionResult> {
  const reasons: string[] = [];
  let score = 0;

  // Check if sender is in contacts
  if (config.detection.checkContacts && !userProfile.isContact && !userProfile.isMutualContact) {
    score += 0.3;
    reasons.push('sender_not_in_contacts');
  }

  // Check common groups
  if (config.detection.checkCommonGroups && !userProfile.hasCommonGroups) {
    score += 0.2;
    reasons.push('no_common_groups');
  }

  // Check profile photo
  if (config.detection.checkProfilePhoto && !userProfile.hasProfilePhoto) {
    score += 0.15;
    reasons.push('no_profile_photo');
  }

  // Check message content for spam patterns
  const text = message.content?.text?.text || '';
  if (text && config.detection.checkLinks && looksSpam(text)) {
    score += 0.4;
    reasons.push('suspicious_content_pattern');
  }

  const isSpam = score >= config.thresholds.lowThreshold;

  if (isSpam) {
    logger.info({
      userId: userProfile.userId,
      score,
      reasons,
      text: text.substring(0, 100),
    }, 'Spam detected');
  }

  return { isSpam, score, reasons };
}

export async function getUserProfile(client: Client, userId: number, chatId: number): Promise<UserProfile> {
  try {
    const user = await client.invoke({
      _: 'getUser',
      user_id: userId,
    });

    // Check for profile photo
    const hasProfilePhoto = user.profile_photo !== undefined;

    // Check for common groups
    let hasCommonGroups = false;
    try {
      const commonChats = await client.invoke({
        _: 'getGroupsInCommon',
        user_id: userId,
        offset_chat_id: 0,
        limit: 1,
      });
      hasCommonGroups = commonChats.total_count > 0;
    } catch (err) {
      logger.debug({ userId, error: err }, 'Could not check common groups');
    }

    return {
      userId,
      isContact: user.is_contact || false,
      isMutualContact: user.is_mutual_contact || false,
      hasProfilePhoto,
      username: user.usernames?.editable_username,
      hasCommonGroups,
    };
  } catch (error) {
    logger.error({ userId, error }, 'Error fetching user profile');
    throw error;
  }
}

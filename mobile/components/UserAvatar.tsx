import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAvatarById } from '../constants/avatars';

interface UserAvatarProps {
  avatarId?: string | null;
  googleAvatarUrl?: string | null;
  fallbackInitial?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  borderWidth?: number;
  borderColor?: string;
  showEditBadge?: boolean;
}

export default function UserAvatar({
  avatarId,
  googleAvatarUrl,
  fallbackInitial = 'U',
  size = 44,
  style,
  borderWidth = 0,
  borderColor,
  showEditBadge = false,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const avatarOption = getAvatarById(avatarId);
  const borderRadius = size / 2;

  // Custom anime avatar selected
  const hasAnimeAvatar = !!avatarOption.image && avatarOption.id !== 'default';

  const badgeSize = Math.max(18, Math.round(size * 0.36));
  const iconSize = Math.round(badgeSize * 0.58);

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius,
    borderWidth,
    borderColor: borderColor || 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const renderContent = () => {
    if (hasAnimeAvatar && avatarOption.image) {
      return (
        <Image
          source={avatarOption.image}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="cover"
        />
      );
    }

    if (!imgError && googleAvatarUrl && googleAvatarUrl.trim()) {
      return (
        <Image
          source={{ uri: googleAvatarUrl }}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      );
    }

    // Default Fallback: Gradient-styled initial circle
    return (
      <View style={[styles.initialContainer, { width: size, height: size, borderRadius }]}>
        <Text style={[styles.initialText, { fontSize: Math.round(size * 0.42) }]}>
          {(fallbackInitial || 'U').toUpperCase()}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.wrapper, { width: size, height: size }, style]}>
      <View style={containerStyle}>
        {renderContent()}
      </View>

      {showEditBadge && (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              bottom: -2,
              right: -2,
            },
          ]}
        >
          <Ionicons name="camera" size={iconSize} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  initialContainer: {
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  badge: {
    position: 'absolute',
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
});

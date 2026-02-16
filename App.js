import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

// 8種類の絵文字 = 8ペア（合計16枚）
const EMOJIS = ["🎰", "🃏", "💎", "🍒", "7️⃣", "♠️", "♥️", "💰"];

// ベストスコア（最小moves）保存キー
const BEST_MOVES_KEY = "memory_match_best_moves_v1";

/**
 * 配列シャッフル（Fisher-Yates）
 */
function shuffle(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

/**
 * デッキ生成: 8絵文字を2倍して16枚にし、シャッフル
 */
function createDeck() {
  const doubled = [...EMOJIS, ...EMOJIS];
  const shuffled = shuffle(doubled);
  return shuffled.map((emoji, index) => ({
    id: index + 1,
    emoji,
    isFlipped: false,
    isMatched: false,
  }));
}

/**
 * 秒を mm:ss に整形
 */
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 1枚のカードUI
 * - isFlipped / isMatched 変化を見て回転アニメーション
 */
function MemoryCard({ card, size, onPress, disabled }) {
  const rotateAnim = useRef(new Animated.Value(card.isFlipped || card.isMatched ? 180 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: card.isFlipped || card.isMatched ? 180 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [card.isFlipped, card.isMatched, rotateAnim]);

  const frontRotate = rotateAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });

  const backRotate = rotateAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <Pressable
      disabled={disabled || card.isMatched || card.isFlipped}
      onPress={onPress}
      style={[styles.cardContainer, { width: size, height: size * 1.2 }]}
    >
      <View style={styles.cardPerspective}>
        <Animated.View style={[styles.cardFace, styles.cardBack, { transform: [{ rotateY: backRotate }] }]}>
          <Text style={styles.cardBackText}>?</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.cardFace,
            styles.cardFront,
            card.isMatched && styles.cardMatched,
            { transform: [{ rotateY: frontRotate }] },
          ]}
        >
          <Text style={styles.cardEmoji}>{card.emoji}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export default function App() {
  const { width } = useWindowDimensions();

  const [cards, setCards] = useState([]);
  const [firstChoice, setFirstChoice] = useState(null);
  const [secondChoice, setSecondChoice] = useState(null);
  const [boardLocked, setBoardLocked] = useState(false);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [bestMoves, setBestMoves] = useState(null);

  const cardSize = useMemo(() => {
    const horizontalPadding = 24 * 2;
    const gaps = 10 * 3;
    const raw = (width - horizontalPadding - gaps) / 4;
    return Math.max(60, Math.min(raw, 90));
  }, [width]);

  const resetTurn = useCallback(() => {
    setFirstChoice(null);
    setSecondChoice(null);
    setBoardLocked(false);
  }, []);

  const startNewGame = useCallback(() => {
    setCards(createDeck());
    setFirstChoice(null);
    setSecondChoice(null);
    setBoardLocked(false);
    setMoves(0);
    setSeconds(0);
    setGameStarted(false);
    setIsWon(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(BEST_MOVES_KEY);
        if (stored !== null) {
          setBestMoves(Number(stored));
        }
      } catch (error) {
        console.log("Best score load error:", error);
      }
    })();

    startNewGame();
  }, [startNewGame]);

  useEffect(() => {
    if (!gameStarted || isWon) return;

    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, isWon]);

  const handleCardPress = useCallback(
    (card) => {
      if (boardLocked || isWon) return;
      if (card.isFlipped || card.isMatched) return;

      if (!gameStarted) setGameStarted(true);

      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, isFlipped: true } : c))
      );

      if (!firstChoice) {
        setFirstChoice({ id: card.id, emoji: card.emoji });
      } else {
        setBoardLocked(true);
        setSecondChoice({ id: card.id, emoji: card.emoji });
        setMoves((prev) => prev + 1);
      }
    },
    [boardLocked, isWon, gameStarted, firstChoice]
  );

  useEffect(() => {
    if (!firstChoice || !secondChoice) return;

    const isMatch = firstChoice.emoji === secondChoice.emoji;

    if (isMatch) {
      setCards((prev) =>
        prev.map((c) =>
          c.id === firstChoice.id || c.id === secondChoice.id
            ? { ...c, isMatched: true }
            : c
        )
      );
      resetTurn();
    } else {
      const timeout = setTimeout(() => {
        setCards((prev) =>
          prev.map((c) =>
            c.id === firstChoice.id || c.id === secondChoice.id
              ? { ...c, isFlipped: false }
              : c
          )
        );
        resetTurn();
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [firstChoice, secondChoice, resetTurn]);

  useEffect(() => {
    if (cards.length === 0) return;

    const allMatched = cards.every((card) => card.isMatched);
    if (!allMatched) return;

    setIsWon(true);
    setGameStarted(false);

    (async () => {
      try {
        if (bestMoves === null || moves < bestMoves) {
          setBestMoves(moves);
          await AsyncStorage.setItem(BEST_MOVES_KEY, String(moves));
        }
      } catch (error) {
        console.log("Best score save error:", error);
      }
    })();
  }, [cards, moves, bestMoves]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.bgGlowTop} />
        <View style={styles.bgGlowBottom} />

        <Text style={styles.title}>Memory Match</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>Moves: {moves}</Text>
          <Text style={styles.infoText}>Time: {formatTime(seconds)}</Text>
        </View>

        <Text style={styles.bestText}>
          Best (Moves): {bestMoves === null ? "--" : bestMoves}
        </Text>

        <Pressable style={styles.restartButton} onPress={startNewGame}>
          <Text style={styles.restartButtonText}>Restart</Text>
        </Pressable>

        <View style={styles.board}>
          {cards.map((card) => (
            <MemoryCard
              key={card.id}
              card={card}
              size={cardSize}
              disabled={boardLocked}
              onPress={() => handleCardPress(card)}
            />
          ))}
        </View>

        <Modal visible={isWon} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>You Win!</Text>
              <Text style={styles.modalText}>Moves: {moves}</Text>
              <Text style={styles.modalText}>Time: {formatTime(seconds)}</Text>
              <Text style={styles.modalText}>
                Best (Moves): {bestMoves === null ? moves : Math.min(bestMoves, moves)}
              </Text>

              <Pressable style={styles.modalButton} onPress={startNewGame}>
                <Text style={styles.modalButtonText}>Play Again</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b3d2e",
  },
  container: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    overflow: "hidden",
  },
  bgGlowTop: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#145c42",
    top: -140,
    right: -90,
  },
  bgGlowBottom: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#0f5132",
    bottom: -100,
    left: -80,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f8d77d",
    marginBottom: 10,
    letterSpacing: 1,
    textShadowColor: "#00000055",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  infoRow: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8f4e8",
  },
  bestText: {
    marginBottom: 10,
    fontSize: 14,
    color: "#f6e7b8",
  },
  restartButton: {
    backgroundColor: "#c81e2b",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#f8d77d",
  },
  restartButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  board: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    backgroundColor: "#0f4c38dd",
    borderRadius: 16,
    padding: 8,
    borderWidth: 2,
    borderColor: "#d4af37",
  },
  cardContainer: {
    marginBottom: 10,
  },
  cardPerspective: {
    flex: 1,
    position: "relative",
  },
  cardFace: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
    borderWidth: 1,
    borderColor: "#00000040",
  },
  cardBack: {
    backgroundColor: "#8b1538",
  },
  cardBackText: {
    fontSize: 28,
    color: "#f8d77d",
    fontWeight: "700",
  },
  cardFront: {
    backgroundColor: "#fffaf0",
  },
  cardMatched: {
    borderColor: "#2e9f4d",
    borderWidth: 2,
  },
  cardEmoji: {
    fontSize: 34,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000066",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fffaf0",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 10,
    color: "#b8860b",
  },
  modalText: {
    fontSize: 16,
    marginBottom: 4,
    color: "#333",
  },
  modalButton: {
    marginTop: 14,
    backgroundColor: "#c81e2b",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f8d77d",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

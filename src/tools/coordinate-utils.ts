// 座標入力を安全に数値に変換するヘルパー
// - 外部から渡される座標は文字列や不正な値の可能性があるため、Number() で強制変換し検証します。
// - ここでは単純に Number() と Number.isFinite() を使ってバリデーションを行います。
// - 例: coerceCoordinates('10', '64', '20') -> { x: 10, y: 64, z: 20 }
export function coerceCoordinates(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const coercedX = Number(x);
  const coercedY = Number(y);
  const coercedZ = Number(z);

  if (!Number.isFinite(coercedX) || !Number.isFinite(coercedY) || !Number.isFinite(coercedZ)) {
    throw new Error("x, y, and z must be valid numbers");
  }

  return { x: coercedX, y: coercedY, z: coercedZ };
}

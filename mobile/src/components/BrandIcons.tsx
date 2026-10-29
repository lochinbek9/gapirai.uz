import Svg, { Line, Path, Rect } from 'react-native-svg';

// lucide yangi versiyalarida brend ikonkalari olib tashlangan -- saytdagi (eski lucide)
// Youtube va Instagram chizmalari shu yerda, LucideIcon bilan bir xil props.
type Props = { size?: number; color?: string; strokeWidth?: number };

/** lucide ikonkasi yoki shu yerdagi brend ikonkasi -- props'da ikonka qabul qiluvchi komponentlar uchun */
export type IconComponent = import('react').ComponentType<Props & { style?: import('react-native').StyleProp<import('react-native').ViewStyle> }>;

function base({ size = 24, color = 'currentColor', strokeWidth = 2 }: Props) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function Youtube(props: Props) {
  return (
    <Svg {...base(props)}>
      <Path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <Path d="m10 15 5-3-5-3z" />
    </Svg>
  );
}

export function Instagram(props: Props) {
  return (
    <Svg {...base(props)}>
      <Rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <Line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </Svg>
  );
}

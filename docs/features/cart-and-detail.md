# 商品详情页与购物车状态机

这一步把 RN 版从「只有商品列表」补齐成 **列表 → 详情 → 购物车** 的闭环，行为和
KMP 版（`shared/src/commonMain/kotlin/com/example/kmp/`）对齐。纯 JS 实现，没有
改动 `harmony/`、`android/`、`ios/` 里的原生代码，也没有新增运行时依赖。

## 数据层：`src/data/products.ts`

六件商品从 KMP 的 `Product.kt` / `ProductCatalog` 照抄，字段是
`id / title / priceYuan / description`。

和 KMP 一样，参与计算的价格是整数 `priceYuan`，界面上的 `¥899` 由
`formatPrice()` 生成，**合计永远不用解析展示字符串**。KMP 的 `Product.price`
是 `"¥$priceYuan"` 的计算属性，这里对应 `formatPrice(product.priceYuan)`。

图片按 ticket 约定暂不移植（KMP 版走网络图片，等后续 ticket 单独处理）。

## 购物车状态机：`src/state/cart.ts`

对应 KMP 的 `Cart.kt`（`CartState` / `CartAction` / `CartStore`）：

| KMP | RN |
| --- | --- |
| `CartItem(id, title, unitPriceYuan, qty)` | `CartItem(productId, title, unitPriceYuan, qty)` |
| `CartAction.Add / Remove / SetQty / Clear` | `CartAction` 的 `add / increment / decrement / remove / clear` |
| `CartStore.dispatch(state, action)` | `cartReducer(state, action)` |
| `CartStore.initial()` | `initialCart` |
| `CartState.count / totalYuan` | `CartState.count / totalYuan`（派生字段） |

`cartReducer` 是纯函数：`(state, action) → next state`，不可变数据，没有
Flow/coroutine 对应物。`count` 和 `totalYuan` 在每次 dispatch 后由
`fromItems()` 重算，界面不手工维护。

行为规则：

- **重复加入同一商品 → 数量 +1**，不新增行（`add` 先按 `productId` 找行）；
- **数量减到 0 → 该行移除**（`decrement` 后 `qty <= 0` 时过滤掉该行）；
- **合计 = Σ(单价 × 数量)**；**总件数 = Σ数量**，即列表顶部的 `购物车 N`；
- 加/减不存在的商品、加入目录里没有的 id 都是 no-op（返回原 state）。

UI 侧只引了 React 自带的 `useReducer`：`useCart()` 返回 `{cart, add, increment,
decrement, remove, clear}`，三个页面拿到的都是同一份状态。

和当前 KMP `cmp-ui` 分支的差异（都按 ticket 范围有意不做）：KMP 现在还有
满 ¥300 减 ¥30 的优惠、网络图片和更多页面；本 ticket 只要求合计、数量与总件数，
所以没有移植优惠规则，避免超出范围。

## 页面与导航

| 文件 | 内容 |
| --- | --- |
| `src/screens/ProductListScreen.tsx` | 保留原列表：标题/价格/描述 + 「加入购物车」；顶部 `购物车 N`，点它进购物车；点卡片进详情 |
| `src/screens/ProductDetailScreen.tsx` | 标题/价格/完整描述 + 「加入购物车」 + 「← 返回列表」 |
| `src/screens/CartScreen.tsx` | 每行的标题/单价/数量/小计 + `−`/`+` + 底部「合计」和「共 N 件」；空购物车有空态提示 |
| `App.tsx` | `Screen` 状态机 + 返回栈 + `BackHandler` |

导航没有引入 `react-navigation`：`Screen` 类型与 KMP 的 `Screen` sealed class
对应（`list` / `detail(productId)` / `cart`），`App.tsx` 用
`useState<Screen[]>` 保存返回栈，最后一项是可见页面：

```ts
export type Screen =
  | {kind: 'list'}
  | {kind: 'detail'; productId: string}
  | {kind: 'cart'};
```

`BackHandler` 监听 `hardwareBackPress`：栈里还有上一页时弹栈并返回 `true`
（消费事件），在列表页返回 `false`，交给平台关闭/后台化应用。Android 硬件返回键
和鸿蒙返回手势都走这条路径——`harmony/entry/src/main/ets/pages/Index.ets` 的
`onBackPress()` 在之前的骨架里已经调用 `rnohCoreContext.dispatchBackPress()`
把返回事件交给 RN，这里没有改原生代码。

## 测试

`__tests__/cart.test.ts`（新增）覆盖：

- 同一商品加两次 → 1 行、数量 2、`count` 2；
- 数量减到 0 → 行移除、`count`/`totalYuan` 归零；
- 多商品合计（899×2 + 499 + 129×3 = 2684）；
- 空购物车合计为 0；
- 未知商品是 no-op；加减已有行、减不存在的行是 no-op。

`__tests__/App.test.tsx` 保留渲染冒烟测试，改用 `act()` 包住挂载/卸载，让
`BackHandler` 的 effect 在测试内完成，避免 Jest 环境拆掉后访问懒加载的 RN 模块。

运行：

```sh
npm test -- --ci
npx tsc --noEmit
```

## 真机验证与证据

在鸿蒙真机 `FMR0224125000567`（ALN-AL00，HarmonyOS 7.0.0.111 / API 26，
1260×2720）上实际操作，并在 `docs/evidence/` 留了截图。Android 只由 CI 的
`:app:assembleDebug` 编译验证，没有在 Android 设备上跑这一步的交互。

| 证据 | 说明 |
| --- | --- |
| `before-cart-harmony-list.jpg` | 基线 `9f701d0`：只有列表，没有加购按钮/购物车入口（同一台鸿蒙设备） |
| `after-cart-harmony-list.jpg` | 同一台设备、同一滚动位置、同一主题；顶部 `购物车 2`、每张卡片有「加入购物车」 |
| `after-cart-harmony-detail.jpg` | 点商品进入的详情页（标题/价格/完整描述/返回/加购） |
| `after-cart-harmony-cart.jpg` | 购物车页：`p-001 ×2`、`p-002 ×1`，合计 `¥2297`，含加减与小计 |

真机上另外验过（截图之外，靠 UI 树/OCR 确认）：

- 列表点「加入购物车」两次：顶部从 `购物车 0` 变为 `购物车 2`，购物车里只有一行、
  数量 2（重复加购没有新增行）；
- 购物车里 `+`/`−` 改数量，合计和小计同步变化；`p-002` 减到 0 后该行消失、
  合计只剩 `¥1798`；
- 返回按钮与系统返回键/手势都能从详情、购物车退回列表，列表再返回会退出应用
  （不是卡死，也不是直接退到桌面而丢失页面）。

只在 jest 里验过的：状态机的边界条件（未知商品、减不存在的行）。没有在 iOS 上
运行（本机 Xcode 27 编不了 RN 0.72.5，见 `docs/harmony-setup.md`）。

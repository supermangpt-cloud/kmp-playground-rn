//
//  BluetoothLe.mm
//  KmpPlaygroundRn
//
//  iOS implementation of the app's `BluetoothLe` module, against
//  CoreBluetooth directly instead of react-native-ble-plx.
//
//  Differences the JS wrapper already accounts for:
//  - a device id here is the peripheral's `identifier.UUIDString`, not a MAC:
//    iOS never exposes hardware addresses to apps;
//  - `getState` is 'on'/'off'/'unknown' like the other two platforms, but iOS
//    additionally has 'unauthorized' and 'unsupported', which collapse into
//    'unknown' with the row explaining why;
//  - connecting to a peripheral the system has never seen fails immediately,
//    so the wrapper's timeout is the only wait.
//
#import "BluetoothLe.h"

#import <CoreBluetooth/CoreBluetooth.h>

/// The map and the connected set are touched from the CoreBluetooth queue and
/// from the JS thread (the synchronous getters), so every access crosses this.
static NSLock *CPBleLock(void) {
  static NSLock *lock = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    lock = [NSLock new];
  });
  return lock;
}

@interface BluetoothLe () <CBCentralManagerDelegate, CBPeripheralDelegate>
@end

@implementation BluetoothLe {
  CBCentralManager *_central;
  dispatch_queue_t _queue;
  /// id -> @{@"id", @"name", @"rssi"}; strongest signal wins per id.
  NSMutableDictionary<NSString *, NSDictionary *> *_found;
  NSMutableDictionary<NSString *, CBPeripheral *> *_connected;
  /// id -> peripheral seen in the last scan; `connect:` resolves an id to one.
  NSMutableDictionary<NSString *, CBPeripheral *> *_peripherals;
  BOOL _scanning;
}

RCT_EXPORT_MODULE(BluetoothLe)

- (instancetype)init {
  if (self = [super init]) {
    _found = [NSMutableDictionary new];
    _connected = [NSMutableDictionary new];
    _peripherals = [NSMutableDictionary new];
    _queue = dispatch_queue_create("com.example.kmp.rn.bluetoothle", DISPATCH_QUEUE_SERIAL);
    // Creating the manager is what asks iOS for the Bluetooth permission; the
    // page's 动态权限 row is what triggers this by calling getState.
    _central = [[CBCentralManager alloc] initWithDelegate:self
                                                    queue:_queue
                                                  options:@{
                                                    CBCentralManagerOptionShowPowerAlertKey: @NO
                                                  }];
  }
  return self;
}

#pragma mark - Exported methods

/// 'on' | 'off' | 'unknown', matching the HarmonyOS and Android vocabulary.
/// `unauthorized` and `unsupported` collapse into 'unknown'; the row states the
/// reason rather than inventing a power state.
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getState) {
  switch (self->_central.state) {
    case CBManagerStatePoweredOn:
      return @"on";
    case CBManagerStatePoweredOff:
      return @"off";
    default:
      return @"unknown";
  }
}

RCT_EXPORT_METHOD(startScan:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject) {
  CBManagerState state = _central.state;
  if (state == CBManagerStateUnsupported) {
    reject(@"unsupported", @"这台设备不支持蓝牙 LE", nil);
    return;
  }
  if (state == CBManagerStateUnauthorized) {
    reject(@"permission", @"未授予蓝牙权限：请在系统设置中允许本 App 使用蓝牙后重试", nil);
    return;
  }
  if (state != CBManagerStatePoweredOn) {
    reject(@"bluetooth_off", @"蓝牙已关闭，请在系统设置中打开蓝牙后重试", nil);
    return;
  }
  dispatch_async(_queue, ^{
    [CPBleLock() lock];
    [self->_found removeAllObjects];
    self->_scanning = YES;
    [CPBleLock() unlock];
    // nil services = every advertiser, mirroring the other two platforms.
    [self->_central scanForPeripheralsWithServices:nil
                                           options:@{
                                             CBCentralManagerScanOptionAllowDuplicatesKey: @YES
                                           }];
    resolve(nil);
  });
}

RCT_EXPORT_METHOD(stopScan) {
  dispatch_async(self->_queue, ^{
    [CPBleLock() lock];
    BOOL wasScanning = self->_scanning;
    self->_scanning = NO;
    [CPBleLock() unlock];
    if (wasScanning) {
      [self->_central stopScan];
    }
  });
}

/// The devices seen since `startScan`, strongest signal first.
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getDevices) {
  [CPBleLock() lock];
  NSArray<NSDictionary *> *snapshot = [_found allValues];
  [CPBleLock() unlock];
  return [snapshot sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
    return [b[@"rssi"] compare:a[@"rssi"]];
  }];
}

RCT_EXPORT_METHOD(connect:(NSString *)deviceId
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject) {
  if (_central.state != CBManagerStatePoweredOn) {
    reject(@"bluetooth_off", @"蓝牙已关闭，请在系统设置中打开蓝牙后重试", nil);
    return;
  }
  dispatch_async(_queue, ^{
    [CPBleLock() lock];
    CBPeripheral *already = self->_connected[deviceId];
    [CPBleLock() unlock];
    if (already != nil) {
      resolve(nil);
      return;
    }
    CBPeripheral *peripheral = [self peripheralForId:deviceId];
    if (peripheral == nil) {
      reject(@"unknown_device", @"这台设备不在最近一次的扫描结果里，请先扫描再连接", nil);
      return;
    }
    resolve(nil);
    peripheral.delegate = self;
    [self->_central connectPeripheral:peripheral options:nil];
  });
}

RCT_EXPORT_METHOD(disconnect:(NSString *)deviceId) {
  dispatch_async(_queue, ^{
    [CPBleLock() lock];
    CBPeripheral *peripheral = self->_connected[deviceId];
    [self->_connected removeObjectForKey:deviceId];
    [CPBleLock() unlock];
    if (peripheral != nil) {
      [self->_central cancelPeripheralConnection:peripheral];
    }
  });
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(isConnected:(NSString *)deviceId) {
  [CPBleLock() lock];
  BOOL connected = self->_connected[deviceId] != nil;
  [CPBleLock() unlock];
  return @(connected);
}

#pragma mark - Helpers

/// The peripheral behind an identifier, taken from the last scan's results.
- (nullable CBPeripheral *)peripheralForId:(NSString *)deviceId {
  for (CBPeripheral *peripheral in [self knownPeripherals]) {
    if ([peripheral.identifier.UUIDString isEqualToString:deviceId]) {
      return peripheral;
    }
  }
  return nil;
}

/// CoreBluetooth keeps the peripherals it has seen; the system can also hand
/// back one it already knows without a scan, which is what `retrievePeripherals`
/// is for.
- (NSArray<CBPeripheral *> *)knownPeripherals {
  NSMutableArray<CBPeripheral *> *list = [NSMutableArray new];
  [CPBleLock() lock];
  for (CBPeripheral *peripheral in _peripherals) {
    [list addObject:peripheral];
  }
  [CPBleLock() unlock];
  return list;
}

#pragma mark - CBCentralManagerDelegate

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
  // The page reads the state on demand through getState; nothing to push.
}

- (void)centralManager:(CBCentralManager *)central
    didDiscoverPeripheral:(CBPeripheral *)peripheral
        advertisementData:(NSDictionary<NSString *, id> *)advertisementData
                     RSSI:(NSNumber *)RSSI {
  NSString *identifier = peripheral.identifier.UUIDString;
  if (identifier == nil) {
    return;
  }
  NSString *name = peripheral.name;
  if (name.length == 0) {
    name = advertisementData[CBAdvertisementDataLocalNameKey] ?: @"";
  }
  [CPBleLock() lock];
  NSDictionary *previous = _found[identifier];
  if (previous != nil && [previous[@"rssi"] integerValue] >= RSSI.integerValue) {
    [CPBleLock() unlock];
    return;
  }
  _found[identifier] = @{
    @"id": identifier,
    @"name": name,
    @"rssi": @(RSSI.integerValue),
  };
  [_peripherals setObject:peripheral forKey:identifier];
  [CPBleLock() unlock];
}

- (void)centralManager:(CBCentralManager *)central
    didConnectPeripheral:(CBPeripheral *)peripheral {
  [CPBleLock() lock];
  _connected[peripheral.identifier.UUIDString] = peripheral;
  [CPBleLock() unlock];
}

- (void)centralManager:(CBCentralManager *)central
    didFailToConnectPeripheral:(CBPeripheral *)peripheral
                         error:(nullable NSError *)error {
  [CPBleLock() lock];
  [_connected removeObjectForKey:peripheral.identifier.UUIDString];
  [CPBleLock() unlock];
}

- (void)centralManager:(CBCentralManager *)central
    didDisconnectPeripheral:(CBPeripheral *)peripheral
                      error:(nullable NSError *)error {
  [CPBleLock() lock];
  [_connected removeObjectForKey:peripheral.identifier.UUIDString];
  [CPBleLock() unlock];
}

@end

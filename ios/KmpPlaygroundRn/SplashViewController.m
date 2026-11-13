#import "SplashViewController.h"

const NSInteger SPLASH_MILLIS = 1000;

@implementation SplashViewController

- (void)viewDidLoad {
  [super viewDidLoad];

  self.view.backgroundColor = [UIColor whiteColor];

  UIView *logo = [[UIView alloc] init];
  logo.translatesAutoresizingMaskIntoConstraints = NO;
  logo.backgroundColor = [UIColor colorWithRed:0x25 / 255.0 green:0x63 / 255.0 blue:0xEB / 255.0 alpha:1.0];
  logo.layer.cornerRadius = 24;
  logo.layer.masksToBounds = YES;
  [self.view addSubview:logo];

  UILabel *logoText = [[UILabel alloc] init];
  logoText.translatesAutoresizingMaskIntoConstraints = NO;
  logoText.text = @"KMP";
  logoText.textColor = [UIColor whiteColor];
  logoText.font = [UIFont boldSystemFontOfSize:32];
  logoText.textAlignment = NSTextAlignmentCenter;
  [logo addSubview:logoText];

  UILabel *title = [[UILabel alloc] init];
  title.translatesAutoresizingMaskIntoConstraints = NO;
  title.text = @"KMP RN Demo";
  title.textColor = [UIColor colorWithRed:0x21 / 255.0 green:0x21 / 255.0 blue:0x21 / 255.0 alpha:1.0];
  title.font = [UIFont boldSystemFontOfSize:24];
  title.textAlignment = NSTextAlignmentCenter;
  [self.view addSubview:title];

  UILabel *subtitle = [[UILabel alloc] init];
  subtitle.translatesAutoresizingMaskIntoConstraints = NO;
  subtitle.text = @"React Native";
  subtitle.textColor = [UIColor colorWithRed:0x75 / 255.0 green:0x75 / 255.0 blue:0x75 / 255.0 alpha:1.0];
  subtitle.font = [UIFont systemFontOfSize:14];
  subtitle.textAlignment = NSTextAlignmentCenter;
  [self.view addSubview:subtitle];

  [NSLayoutConstraint activateConstraints:@[
    [logo.widthAnchor constraintEqualToConstant:120],
    [logo.heightAnchor constraintEqualToConstant:120],
    [logo.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
    [logo.centerYAnchor constraintEqualToAnchor:self.view.centerYAnchor constant:-40],

    [logoText.centerXAnchor constraintEqualToAnchor:logo.centerXAnchor],
    [logoText.centerYAnchor constraintEqualToAnchor:logo.centerYAnchor],

    [title.topAnchor constraintEqualToAnchor:logo.bottomAnchor constant:20],
    [title.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],

    [subtitle.topAnchor constraintEqualToAnchor:title.bottomAnchor constant:6],
    [subtitle.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
  ]];
}

@end

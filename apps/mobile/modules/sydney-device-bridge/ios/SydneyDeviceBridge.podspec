Pod::Spec.new do |s|
  s.name           = 'SydneyDeviceBridge'
  s.version        = '0.1.0'
  s.summary        = 'Sydney native iOS EventKit (Calendar/Reminders), Contacts, and Clipboard bridge'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'EventKit', 'Contacts', 'UIKit'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end

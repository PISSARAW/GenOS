use uiautomation::UIAutomation; fn main() { let uia = UIAutomation::new().unwrap(); let point = (100, 200).into(); let el = uia.element_from_point(point).unwrap(); println!("{:?}", el.get_name()); }

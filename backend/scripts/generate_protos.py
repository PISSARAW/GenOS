import os
import re

routes_dir = os.path.join("src", "routes")
proto_dir = "proto"

if not os.path.exists(proto_dir):
    os.makedirs(proto_dir)

for filename in os.listdir(routes_dir):
    if filename.endswith("Routes.js"):
        service_name = filename.replace("Routes.js", "")
        Capitalized = service_name.capitalize()
        
        # very basic proto generation
        proto_content = f"""syntax = "proto3";

package genos.{service_name};

service {Capitalized}Service {{
  rpc Ping (Empty) returns (PingResponse);
}}

message Empty {{}}

message PingResponse {{
  string status = 1;
}}
"""
        with open(os.path.join(proto_dir, f"{service_name}.proto"), "w") as f:
            f.write(proto_content)
        print(f"Generated {service_name}.proto")
